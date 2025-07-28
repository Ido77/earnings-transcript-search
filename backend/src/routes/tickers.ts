import { Router } from 'express';
import { body, query, validationResult } from 'express-validator';
import multer from 'multer';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { asyncHandler } from '@/middleware/errorHandler';
import { transcriptService } from '@/services/transcriptService';
import { getLastFourQuarters } from '@/services/quarterCalculator';
import { AppError, BulkFetchRequestSchema } from '@/types';
import { logger } from '@/config/logger';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024, // 1MB limit
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

/**
 * POST /api/tickers/bulk-fetch
 * Fetch transcripts for multiple tickers
 */
router.post(
  '/bulk-fetch',
  [
    body('tickers')
      .isArray({ min: 1, max: 100 })
      .withMessage('Tickers must be an array with 1-100 items'),
    
    body('tickers.*')
      .isString()
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage('Each ticker must be a string with 1-10 characters'),
    
    body('quarters')
      .optional()
      .isArray({ max: 20 })
      .withMessage('Quarters must be an array with max 20 items'),
    
    body('quarters.*.year')
      .optional()
      .isInt({ min: 2000, max: 2030 })
      .withMessage('Year must be between 2000 and 2030'),
    
    body('quarters.*.quarter')
      .optional()
      .isInt({ min: 1, max: 4 })
      .withMessage('Quarter must be between 1 and 4'),
    
    body('forceRefresh')
      .optional()
      .isBoolean()
      .withMessage('forceRefresh must be a boolean'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    // Validate with Zod schema
    const requestData = BulkFetchRequestSchema.parse(req.body);

    const startTime = Date.now();
    logger.info('Starting bulk fetch operation', {
      tickerCount: requestData.tickers.length,
      forceRefresh: requestData.forceRefresh,
      quarters: requestData.quarters?.length || 'auto (last 4)',
    });

    // Use provided quarters or calculate last 4 quarters
    const quartersToFetch = requestData.quarters || getLastFourQuarters();

    const results = await transcriptService.bulkFetchTranscripts(
      requestData.tickers,
      quartersToFetch,
      requestData.forceRefresh
    );

    const executionTime = Date.now() - startTime;

    logger.info('Bulk fetch operation completed', {
      tickerCount: requestData.tickers.length,
      total: results.summary.total,
      successful: results.summary.successful,
      failed: results.summary.failed,
      skipped: results.summary.skipped,
      executionTime,
    });

    res.json({
      ...results,
      executionTime,
    });
  })
);

/**
 * POST /api/tickers/upload-csv
 * Upload a CSV file containing tickers
 */
router.post(
  '/upload-csv',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400, 'NO_FILE');
    }

    const tickers: string[] = [];
    const stream = Readable.from(req.file.buffer);

    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', (row) => {
          // Look for common column names
          const ticker = row.ticker || row.TICKER || row.symbol || row.SYMBOL || row.Symbol;
          if (ticker && typeof ticker === 'string') {
            const cleanTicker = ticker.trim().toUpperCase();
            if (cleanTicker.length > 0 && cleanTicker.length <= 10) {
              tickers.push(cleanTicker);
            }
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (tickers.length === 0) {
      throw new AppError('No valid tickers found in CSV file', 400, 'NO_TICKERS_FOUND');
    }

    // Remove duplicates
    const uniqueTickers = [...new Set(tickers)];

    if (uniqueTickers.length > 100) {
      throw new AppError('Too many tickers in file (max 100)', 400, 'TOO_MANY_TICKERS');
    }

    logger.info('CSV file processed', {
      originalCount: tickers.length,
      uniqueCount: uniqueTickers.length,
      filename: req.file.originalname,
    });

    res.json({
      tickers: uniqueTickers,
      totalCount: uniqueTickers.length,
      duplicatesRemoved: tickers.length - uniqueTickers.length,
    });
  })
);

/**
 * GET /api/tickers
 * Get list of all tickers in the database
 */
router.get(
  '/',
  [
    query('search')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Search query must be max 50 characters'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
    
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative')
      .toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const {
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    const result = await transcriptService.getAvailableTickers({
      search: search as string | undefined,
      limit: limit as number,
      offset: offset as number,
    });

    res.json(result);
  })
);

/**
 * GET /api/tickers/:ticker
 * Get details for a specific ticker
 */
router.get(
  '/:ticker',
  asyncHandler(async (req, res) => {
    const { ticker } = req.params;
    
    if (!ticker || ticker.length > 10) {
      throw new AppError('Invalid ticker format', 400, 'INVALID_TICKER');
    }

    const tickerUpper = ticker.toUpperCase();
    const details = await transcriptService.getTickerDetails(tickerUpper);

    if (!details) {
      throw new AppError('Ticker not found', 404, 'TICKER_NOT_FOUND');
    }

    res.json(details);
  })
);

/**
 * POST /api/tickers/:ticker/refresh
 * Refresh transcripts for a specific ticker
 */
router.post(
  '/:ticker/refresh',
  [
    body('quarters')
      .optional()
      .isArray({ max: 20 })
      .withMessage('Quarters must be an array with max 20 items'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { ticker } = req.params;
    const { quarters } = req.body;

    if (!ticker || ticker.length > 10) {
      throw new AppError('Invalid ticker format', 400, 'INVALID_TICKER');
    }

    const tickerUpper = ticker.toUpperCase();
    const quartersToRefresh = quarters || getLastFourQuarters();

    logger.info('Refreshing ticker transcripts', {
      ticker: tickerUpper,
      quarterCount: quartersToRefresh.length,
    });

    const results = await transcriptService.bulkFetchTranscripts(
      [tickerUpper],
      quartersToRefresh,
      true // Force refresh
    );

    res.json({
      ticker: tickerUpper,
      results: results.results.filter(r => r.ticker === tickerUpper),
      summary: results.summary,
    });
  })
);

export default router; 