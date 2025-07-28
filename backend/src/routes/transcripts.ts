import { Router } from 'express';
import { param, query, validationResult } from 'express-validator';
import { asyncHandler } from '@/middleware/errorHandler';
import { transcriptService } from '@/services/transcriptService';
import { AppError } from '@/types';

const router = Router();

/**
 * GET /api/transcripts
 * Get transcripts with filtering and pagination
 */
router.get(
  '/',
  [
    query('ticker')
      .optional()
      .trim()
      .isLength({ max: 10 })
      .withMessage('Ticker must be max 10 characters'),
    
    query('year')
      .optional()
      .isInt({ min: 2000, max: 2030 })
      .withMessage('Year must be between 2000 and 2030')
      .toInt(),
    
    query('quarter')
      .optional()
      .isInt({ min: 1, max: 4 })
      .withMessage('Quarter must be between 1 and 4')
      .toInt(),
    
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
    
    query('sortBy')
      .optional()
      .isIn(['date', 'ticker', 'quarter', 'createdAt'])
      .withMessage('sortBy must be one of: date, ticker, quarter, createdAt'),
    
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('sortOrder must be asc or desc'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const {
      ticker,
      year,
      quarter,
      limit = 20,
      offset = 0,
      sortBy = 'date',
      sortOrder = 'desc',
    } = req.query;

    const filters = {
      ticker: ticker as string | undefined,
      year: year as number | undefined,
      quarter: quarter as number | undefined,
    };

    const pagination = {
      limit: limit as number,
      offset: offset as number,
      sortBy: sortBy as 'date' | 'ticker' | 'quarter' | 'createdAt',
      sortOrder: sortOrder as 'asc' | 'desc',
    };

    const result = await transcriptService.getTranscripts(filters, pagination);

    res.json(result);
  })
);

/**
 * GET /api/transcripts/:id
 * Get a specific transcript by ID
 */
router.get(
  '/:id',
  [
    param('id')
      .isUUID()
      .withMessage('ID must be a valid UUID'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { id } = req.params;
    const transcript = await transcriptService.getTranscriptById(id);

    if (!transcript) {
      throw new AppError('Transcript not found', 404, 'TRANSCRIPT_NOT_FOUND');
    }

    res.json(transcript);
  })
);

/**
 * GET /api/transcripts/:ticker/:year/:quarter
 * Get a specific transcript by ticker, year, and quarter
 */
router.get(
  '/:ticker/:year/:quarter',
  [
    param('ticker')
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage('Ticker must be between 1 and 10 characters'),
    
    param('year')
      .isInt({ min: 2000, max: 2030 })
      .withMessage('Year must be between 2000 and 2030')
      .toInt(),
    
    param('quarter')
      .isInt({ min: 1, max: 4 })
      .withMessage('Quarter must be between 1 and 4')
      .toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { ticker, year, quarter } = req.params;
    
    const transcript = await transcriptService.getTranscriptByTickerQuarter(
      ticker.toUpperCase(),
      parseInt(year, 10),
      parseInt(quarter, 10)
    );

    if (!transcript) {
      throw new AppError('Transcript not found', 404, 'TRANSCRIPT_NOT_FOUND');
    }

    res.json(transcript);
  })
);

/**
 * DELETE /api/transcripts/:id
 * Delete a specific transcript
 */
router.delete(
  '/:id',
  [
    param('id')
      .isUUID()
      .withMessage('ID must be a valid UUID'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { id } = req.params;
    const deleted = await transcriptService.deleteTranscript(id);

    if (!deleted) {
      throw new AppError('Transcript not found', 404, 'TRANSCRIPT_NOT_FOUND');
    }

    res.json({
      message: 'Transcript deleted successfully',
      id,
    });
  })
);

/**
 * GET /api/transcripts/:ticker/quarters
 * Get available quarters for a specific ticker
 */
router.get(
  '/:ticker/quarters',
  [
    param('ticker')
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage('Ticker must be between 1 and 10 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { ticker } = req.params;
    const quarters = await transcriptService.getAvailableQuarters(ticker.toUpperCase());

    res.json({
      ticker: ticker.toUpperCase(),
      quarters,
      totalQuarters: quarters.length,
    });
  })
);

/**
 * GET /api/transcripts/:id/export
 * Export a transcript in various formats
 */
router.get(
  '/:id/export',
  [
    param('id')
      .isUUID()
      .withMessage('ID must be a valid UUID'),
    
    query('format')
      .optional()
      .isIn(['json', 'txt', 'csv'])
      .withMessage('Format must be json, txt, or csv'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { id } = req.params;
    const { format = 'json' } = req.query;

    const transcript = await transcriptService.getTranscriptById(id);

    if (!transcript) {
      throw new AppError('Transcript not found', 404, 'TRANSCRIPT_NOT_FOUND');
    }

    const filename = `transcript_${transcript.ticker}_${transcript.year}Q${transcript.quarter}`;

    switch (format) {
      case 'txt':
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.txt"`);
        res.send(transcript.fullTranscript);
        break;

      case 'csv':
        const csvContent = await transcriptService.exportToCsv([transcript]);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csvContent);
        break;

      default: // json
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json(transcript);
    }
  })
);

export default router; 