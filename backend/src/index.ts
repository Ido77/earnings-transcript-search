// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

// Log debug info to see what's loaded
console.log('DEBUG: API_NINJAS_KEY from env:', process.env.API_NINJAS_KEY?.substring(0, 10) + '...');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';

import { config } from '@/config/config';
import { logger } from '@/config/logger';
import { prisma } from '@/config/database';
import { asyncHandler } from '@/utils/asyncHandler';
import { apiNinjasService } from '@/services/apiNinjas';
import { JobManager } from '@/services/jobManager';

// File-based persistent cache
const CACHE_FILE = path.join(__dirname, '../cache/transcripts.json');

// Ensure cache directory exists
const cacheDir = path.dirname(CACHE_FILE);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Load cache from file on startup
const loadCacheFromFile = (): Map<string, any> => {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const stats = fs.statSync(CACHE_FILE);
      
      // Check file size - if too large, skip loading and log warning
      const maxSizeBytes = 10 * 1024 * 1024; // 10MB limit
      if (stats.size > maxSizeBytes) {
        logger.warn('Cache file too large, skipping load and creating backup', { 
          size: `${(stats.size / 1024 / 1024).toFixed(1)}MB`,
          maxSize: `${maxSizeBytes / 1024 / 1024}MB`,
          file: CACHE_FILE 
        });
        
        // Move large cache to backup
        const backupFile = CACHE_FILE.replace('.json', `_backup_${Date.now()}.json`);
        fs.renameSync(CACHE_FILE, backupFile);
        logger.info('Large cache backed up', { backupFile });
        
        return new Map();
      }
      
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      const cacheData = JSON.parse(data);
      const cache = new Map();
      Object.entries(cacheData).forEach(([key, value]) => {
        cache.set(key, value);
      });
      logger.info('Cache loaded from file', { 
        entries: cache.size,
        fileSize: `${(stats.size / 1024 / 1024).toFixed(1)}MB`,
        file: CACHE_FILE 
      });
      return cache;
    }
  } catch (error) {
    logger.error('Failed to load cache from file', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      file: CACHE_FILE 
    });
  }
  return new Map();
};

// Save cache to file
const saveCacheToFile = (cache: Map<string, any>): void => {
  try {
    // Convert Map to object for JSON serialization
    const cacheData = Object.fromEntries(cache.entries());
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
    
    logger.info('Cache saved to file', { 
      entries: cache.size,
      file: CACHE_FILE 
    });
  } catch (error) {
    logger.error('Failed to save cache to file', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      file: CACHE_FILE 
    });
  }
};

// Initialize persistent cache
const transcriptCache = loadCacheFromFile();

// Initialize job manager
const jobManager = new JobManager(transcriptCache);

// Listen for job progress events
jobManager.on('progress', ({ jobId, job }) => {
  logger.info('Job progress update', {
    jobId,
    progress: `${job.progress.current}/${job.progress.total}`,
    currentTicker: job.progress.currentTicker,
    processed: job.progress.processed.length,
    failed: job.progress.failed.length,
    skipped: job.progress.skipped.length
  });
});

jobManager.on('completed', ({ jobId, job }) => {
  logger.info('Job completed successfully', {
    jobId,
    total: job.tickers.length,
    processed: job.progress.processed.length,
    failed: job.progress.failed.length,
    skipped: job.progress.skipped.length
  });
});

const app = express();

// Trust proxy (important for rate limiting and IP detection)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:3002',
    'http://localhost:3003'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    },
  },
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
    version: '1.0.0',
    mode: config.apiNinjas.isDemo ? 'demo' : 'production',
    apiKeyStatus: config.apiNinjas.isDemo ? 'demo' : 'real',
    cacheSize: transcriptCache.size,
  });
});

// Simple debug endpoint
app.get('/debug', (req, res) => {
  res.json({
    message: 'Debug endpoint working',
    timestamp: new Date().toISOString(),
    cacheSize: transcriptCache.size,
    memory: process.memoryUsage(),
  });
});

// Debug endpoint to check configuration
app.get('/debug/config', (req, res) => {
  res.json({
    apiKeyPresent: !!process.env.API_NINJAS_KEY,
    apiKeyPrefix: process.env.API_NINJAS_KEY?.substring(0, 10) + '...',
    configApiKey: config.apiNinjas.key.substring(0, 10) + '...',
    isDemo: config.apiNinjas.isDemo,
    environment: config.nodeEnv,
  });
});

// Simple test endpoints to verify functionality
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!', timestamp: new Date().toISOString() });
});

// Bulk fetch transcripts endpoint (DEPRECATED - keeping for compatibility)
app.post('/api/tickers/bulk-fetch', asyncHandler(async (req, res) => {
  const { tickers: rawTickers } = req.body;
  const tickers = Array.isArray(rawTickers) ? rawTickers.map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];

  if (tickers.length === 0) {
    return res.status(400).json({ error: 'No tickers provided' });
  }

  // Create background job instead of processing synchronously
  const jobId = jobManager.createBulkFetchJob(tickers);

  res.json({
    message: 'Background job created successfully',
    jobId,
    status: 'pending',
    tickerCount: tickers.length,
    note: 'Use /api/jobs/{jobId}/progress to monitor progress'
  });
}));

// Create background job endpoint
app.post('/api/jobs/bulk-fetch', asyncHandler(async (req, res) => {
  const { tickers: rawTickers } = req.body;
  const tickers = Array.isArray(rawTickers) ? rawTickers.map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];

  if (tickers.length === 0) {
    return res.status(400).json({ error: 'No tickers provided' });
  }

  const jobId = jobManager.createBulkFetchJob(tickers);

  res.json({
    message: 'Background job created successfully',
    jobId,
    status: 'pending',
    tickerCount: tickers.length,
    estimatedTime: `${Math.ceil(tickers.length * 2 / 60)} minutes`,
    endpoints: {
      progress: `/api/jobs/${jobId}/progress`,
      pause: `/api/jobs/${jobId}/pause`,
      resume: `/api/jobs/${jobId}/resume`
    }
  });
}));

// Get job progress
app.get('/api/jobs/:jobId/progress', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const progress = jobManager.getJobProgress(jobId);

  if (!progress) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(progress);
}));

// Pause job
app.post('/api/jobs/:jobId/pause', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const paused = jobManager.pauseJob(jobId);

  if (!paused) {
    return res.status(400).json({ error: 'Job cannot be paused (not running or not found)' });
  }

  res.json({ message: 'Job paused successfully', jobId });
}));

// Resume job
app.post('/api/jobs/:jobId/resume', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const resumed = jobManager.resumeJob(jobId);

  if (!resumed) {
    return res.status(400).json({ error: 'Job cannot be resumed (not paused or not found)' });
  }

  res.json({ message: 'Job resumed successfully', jobId });
}));

// Get all jobs (admin endpoint)
app.get('/api/jobs', asyncHandler(async (req, res) => {
  const jobs = jobManager.getAllJobs();
  res.json({
    jobs: jobs.map(job => ({
      id: job.id,
      status: job.status,
      tickerCount: job.tickers.length,
      progress: `${job.progress.current}/${job.progress.total}`,
      processed: job.progress.processed.length,
      failed: job.progress.failed.length,
      skipped: job.progress.skipped.length,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      currentTicker: job.progress.currentTicker
    }))
  });
}));

// Search endpoint that works with memory cache
app.post('/api/search', async (req, res) => {
  try {
    const { query, filters = {}, highlight = true, sortBy = 'relevance' } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    const startTime = Date.now();
    const searchTerm = query.toLowerCase();
    const results: any[] = [];

    // Search through cached transcripts
    for (const [cacheKey, transcript] of transcriptCache.entries()) {
      const fullText = transcript.fullTranscript.toLowerCase();
      
      // Apply filters
      if (filters.tickers && filters.tickers.length > 0) {
        // Make ticker filtering case-insensitive
        const filterTickers = filters.tickers.map((t: string) => t.toLowerCase());
        if (!filterTickers.includes(transcript.ticker.toLowerCase())) continue;
      }
      if (filters.years && filters.years.length > 0) {
        if (!filters.years.includes(transcript.year)) continue;
      }
      if (filters.quarters && filters.quarters.length > 0) {
        if (!filters.quarters.includes(transcript.quarter)) continue;
      }

      // Check if search term exists in transcript
      if (fullText.includes(searchTerm)) {
        // Find search term position for snippet
        const index = fullText.indexOf(searchTerm);
        const start = Math.max(0, index - 100);
        const end = Math.min(transcript.fullTranscript.length, index + 200);
        
        let snippet = transcript.fullTranscript.substring(start, end);
        if (highlight) {
          const regex = new RegExp(`(${query})`, 'gi');
          snippet = snippet.replace(regex, '<mark>$1</mark>');
        }

        // Count matches
        const matches = (fullText.match(new RegExp(searchTerm, 'g')) || []).length;

        results.push({
          id: transcript.id,
          ticker: transcript.ticker,
          companyName: transcript.companyName,
          year: transcript.year,
          quarter: transcript.quarter,
          callDate: transcript.callDate,
          snippet: snippet,
          relevanceScore: matches / transcript.fullTranscript.length * 1000,
          matchCount: matches,
        });
      }
    }

    // Sort results based on sortBy parameter
    if (sortBy === 'date') {
      // Sort by year (desc) then quarter (desc) for most recent first
      results.sort((a, b) => {
        if (a.year !== b.year) {
          return b.year - a.year; // Most recent year first
        }
        return b.quarter - a.quarter; // Most recent quarter first
      });
    } else {
      // Default: sort by relevance score (highest first)
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    // Apply pagination
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    const paginatedResults = results.slice(offset, offset + limit);

    const executionTime = Date.now() - startTime;

    logger.info('Search completed', {
      query,
      sortBy,
      totalResults: results.length,
      returnedResults: paginatedResults.length,
      executionTime,
    });

    res.json({
      results: paginatedResults,
      total: results.length,
      page: Math.floor(offset / limit) + 1,
      limit,
      executionTime,
      query,
      filters,
      sortBy,
    });
  } catch (error) {
    logger.error('Search error', { error });
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get cached transcripts count (must be before the dynamic :id route)
app.get('/api/transcripts/count', (req, res) => {
  const cacheStats = {
    total: transcriptCache.size,
    tickers: [...new Set([...transcriptCache.values()].map(t => t.ticker))],
    cached: true,
    persistent: true,
    cacheFile: CACHE_FILE,
    fileExists: fs.existsSync(CACHE_FILE),
    entries: [...transcriptCache.keys()].sort()
  };
  
  res.json(cacheStats);
});

// Get individual transcript by ID
app.get('/api/transcripts/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    if (!transcriptCache.has(id)) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    
    const transcript = transcriptCache.get(id);
    
    logger.info('Transcript retrieved for copy', {
      id,
      ticker: transcript.ticker,
      year: transcript.year,
      quarter: transcript.quarter,
      length: transcript.fullTranscript.length,
    });
    
    res.json({
      id: transcript.id,
      ticker: transcript.ticker,
      year: transcript.year,
      quarter: transcript.quarter,
      fullTranscript: transcript.fullTranscript,
      callDate: transcript.callDate,
      length: transcript.fullTranscript.length,
    });
  } catch (error) {
    logger.error('Error retrieving transcript', { 
      id: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    res.status(500).json({ error: 'Failed to retrieve transcript' });
  }
});

// Basic error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(config.port, () => {
  logger.info(`🚀 Server running on port ${config.port} in ${config.nodeEnv} mode`, {
    service: 'transcript-search-api',
    environment: config.nodeEnv,
  });
  logger.info(`📝 API documentation available at http://localhost:${config.port}/health`, {
    service: 'transcript-search-api',
    environment: config.nodeEnv,
  });
  logger.info(`🎯 Demo mode: ${config.apiNinjas.isDemo}`, {
    service: 'transcript-search-api',
    environment: config.nodeEnv,
  });
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`, {
    service: 'transcript-search-api',
    environment: config.nodeEnv,
  });

  // Save cache before shutdown
  saveCacheToFile(transcriptCache);
  
  server.close(() => {
    logger.info('HTTP server closed');
    prisma.$disconnect().then(() => {
      logger.info('Database connection closed');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app; 