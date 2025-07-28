import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import { asyncHandler } from '@/middleware/errorHandler';
import { statsService } from '@/services/statsService';
import { AppError } from '@/types';

const router = Router();

/**
 * GET /api/stats
 * Get overall system statistics
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const stats = await statsService.getSystemStats();
    res.json(stats);
  })
);

/**
 * GET /api/stats/transcripts
 * Get transcript-related statistics
 */
router.get(
  '/transcripts',
  [
    query('groupBy')
      .optional()
      .isIn(['ticker', 'quarter', 'year', 'month'])
      .withMessage('groupBy must be one of: ticker, quarter, year, month'),
    
    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('dateFrom must be a valid ISO 8601 date'),
    
    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('dateTo must be a valid ISO 8601 date'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const {
      groupBy,
      dateFrom,
      dateTo,
    } = req.query;

    const filters = {
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
    };

    const stats = await statsService.getTranscriptStats(
      groupBy as 'ticker' | 'quarter' | 'year' | 'month' | undefined,
      filters
    );

    res.json(stats);
  })
);

/**
 * GET /api/stats/search
 * Get search-related statistics
 */
router.get(
  '/search',
  [
    query('period')
      .optional()
      .isIn(['hour', 'day', 'week', 'month'])
      .withMessage('period must be one of: hour, day, week, month'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit must be between 1 and 100')
      .toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const {
      period = 'day',
      limit = 20,
    } = req.query;

    const stats = await statsService.getSearchStats(
      period as 'hour' | 'day' | 'week' | 'month',
      limit as number
    );

    res.json(stats);
  })
);

/**
 * GET /api/stats/performance
 * Get performance-related statistics
 */
router.get(
  '/performance',
  [
    query('metric')
      .optional()
      .isIn(['response_time', 'search_time', 'fetch_time'])
      .withMessage('metric must be one of: response_time, search_time, fetch_time'),
    
    query('timeframe')
      .optional()
      .isIn(['1h', '24h', '7d', '30d'])
      .withMessage('timeframe must be one of: 1h, 24h, 7d, 30d'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const {
      metric = 'response_time',
      timeframe = '24h',
    } = req.query;

    const stats = await statsService.getPerformanceStats(
      metric as 'response_time' | 'search_time' | 'fetch_time',
      timeframe as '1h' | '24h' | '7d' | '30d'
    );

    res.json(stats);
  })
);

/**
 * GET /api/stats/coverage
 * Get data coverage statistics
 */
router.get(
  '/coverage',
  [
    query('tickers')
      .optional()
      .customSanitizer((value) => {
        if (typeof value === 'string') {
          return value.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
        }
        return value;
      }),
  ],
  asyncHandler(async (req, res) => {
    const { tickers } = req.query;

    const stats = await statsService.getCoverageStats(tickers as string[] | undefined);

    res.json(stats);
  })
);

/**
 * GET /api/stats/top-searches
 * Get most popular search queries
 */
router.get(
  '/top-searches',
  [
    query('period')
      .optional()
      .isIn(['day', 'week', 'month', 'year'])
      .withMessage('period must be one of: day, week, month, year'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('limit must be between 1 and 50')
      .toInt(),
    
    query('type')
      .optional()
      .isIn(['keyword', 'regex', 'all'])
      .withMessage('type must be one of: keyword, regex, all'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const {
      period = 'week',
      limit = 20,
      type = 'all',
    } = req.query;

    const topSearches = await statsService.getTopSearchQueries(
      period as 'day' | 'week' | 'month' | 'year',
      limit as number,
      type as 'keyword' | 'regex' | 'all'
    );

    res.json({
      period,
      type,
      limit,
      searches: topSearches,
    });
  })
);

/**
 * GET /api/stats/health
 * Get system health metrics
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const health = await statsService.getHealthMetrics();
    
    // Set appropriate status code based on health
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'warning' ? 200 : 503;
    
    res.status(statusCode).json(health);
  })
);

/**
 * GET /api/stats/api-usage
 * Get API usage statistics
 */
router.get(
  '/api-usage',
  [
    query('timeframe')
      .optional()
      .isIn(['1h', '24h', '7d', '30d'])
      .withMessage('timeframe must be one of: 1h, 24h, 7d, 30d'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { timeframe = '24h' } = req.query;

    const usage = await statsService.getApiUsageStats(
      timeframe as '1h' | '24h' | '7d' | '30d'
    );

    res.json(usage);
  })
);

export default router; 