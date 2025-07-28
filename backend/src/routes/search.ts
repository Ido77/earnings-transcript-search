import { Router } from 'express';
import { body, query, validationResult } from 'express-validator';
import { asyncHandler } from '@/middleware/errorHandler';
import { searchService } from '@/services/searchService';
import { AppError } from '@/types';
import { config } from '@/config/config';

const router = Router();

/**
 * GET /api/search
 * Search transcripts with keyword or regex
 */
router.get(
  '/',
  [
    query('q')
      .trim()
      .isLength({ min: 1, max: config.search.maxQueryLength })
      .withMessage(`Query must be between 1 and ${config.search.maxQueryLength} characters`),
    
    query('type')
      .optional()
      .isIn(['keyword', 'regex'])
      .withMessage('Search type must be "keyword" or "regex"'),
    
    query('tickers')
      .optional()
      .customSanitizer((value) => {
        if (typeof value === 'string') {
          return value.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
        }
        return value;
      }),
    
    query('years')
      .optional()
      .customSanitizer((value) => {
        if (typeof value === 'string') {
          return value.split(',').map(y => parseInt(y, 10)).filter(y => !isNaN(y));
        }
        return value;
      }),
    
    query('quarters')
      .optional()
      .customSanitizer((value) => {
        if (typeof value === 'string') {
          return value.split(',').map(q => parseInt(q, 10)).filter(q => q >= 1 && q <= 4);
        }
        return value;
      }),
    
    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('dateFrom must be a valid ISO 8601 date'),
    
    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('dateTo must be a valid ISO 8601 date'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: config.search.maxResultsPerPage })
      .withMessage(`Limit must be between 1 and ${config.search.maxResultsPerPage}`)
      .toInt(),
    
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
      .toInt(),
    
    query('highlight')
      .optional()
      .isBoolean()
      .withMessage('Highlight must be a boolean')
      .toBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const {
      q: query,
      type = 'keyword',
      tickers,
      years,
      quarters,
      dateFrom,
      dateTo,
      limit = config.search.defaultResultsPerPage,
      offset = 0,
      highlight = true,
    } = req.query;

    const filters = {
      tickers: tickers as string[] | undefined,
      years: years as number[] | undefined,
      quarters: quarters as number[] | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      limit: limit as number,
      offset: offset as number,
    };

    const startTime = Date.now();
    
    let results;
    if (type === 'regex') {
      results = await searchService.searchRegex(query as string, filters, highlight as boolean);
    } else {
      results = await searchService.searchKeywords(query as string, filters, highlight as boolean);
    }

    const executionTime = Date.now() - startTime;

    // Log search for analytics
    await searchService.logSearch({
      query: query as string,
      filters,
      resultCount: results.total,
      executionTime,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
    });

    res.json({
      ...results,
      executionTime,
    });
  })
);

/**
 * POST /api/search/advanced
 * Advanced search with complex filters
 */
router.post(
  '/advanced',
  [
    body('query')
      .trim()
      .isLength({ min: 1, max: config.search.maxQueryLength })
      .withMessage(`Query must be between 1 and ${config.search.maxQueryLength} characters`),
    
    body('type')
      .optional()
      .isIn(['keyword', 'regex', 'fuzzy'])
      .withMessage('Search type must be "keyword", "regex", or "fuzzy"'),
    
    body('filters')
      .optional()
      .isObject()
      .withMessage('Filters must be an object'),
    
    body('filters.tickers')
      .optional()
      .isArray({ max: 50 })
      .withMessage('Tickers must be an array with max 50 items'),
    
    body('filters.speakers')
      .optional()
      .isArray({ max: 20 })
      .withMessage('Speakers must be an array with max 20 items'),
    
    body('options.highlight')
      .optional()
      .isBoolean()
      .withMessage('Highlight option must be a boolean'),
    
    body('options.snippetLength')
      .optional()
      .isInt({ min: 50, max: 500 })
      .withMessage('Snippet length must be between 50 and 500 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const {
      query,
      type = 'keyword',
      filters = {},
      options = {},
    } = req.body;

    const startTime = Date.now();
    
    let results;
    switch (type) {
      case 'regex':
        results = await searchService.searchRegex(query, filters, options.highlight ?? true);
        break;
      case 'fuzzy':
        results = await searchService.searchFuzzy(query, filters, options);
        break;
      default:
        results = await searchService.searchKeywords(query, filters, options.highlight ?? true);
    }

    const executionTime = Date.now() - startTime;

    // Log search for analytics
    await searchService.logSearch({
      query,
      filters,
      resultCount: results.total,
      executionTime,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
    });

    res.json({
      ...results,
      executionTime,
    });
  })
);

/**
 * GET /api/search/suggestions
 * Get search suggestions based on query
 */
router.get(
  '/suggestions',
  [
    query('q')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Query must be between 2 and 100 characters'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20')
      .toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }

    const { q: query, limit = 10 } = req.query;

    const suggestions = await searchService.getSuggestions(query as string, limit as number);

    res.json({
      query,
      suggestions,
    });
  })
);

export default router; 