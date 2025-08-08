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
import { EnhancedJobManager } from '@/services/enhancedJobManager';
import tickersRouter from '@/routes/tickers';
import searchRouter from '@/routes/search';
import { searchService } from '@/services/searchService';
import { transcriptService } from '@/services/transcriptService';
import { GoogleAIService } from '@/services/googleAIService';
import { BulkAIService } from '@/services/bulkAIService';

// File-based persistent cache
const CACHE_FILE = path.join(__dirname, '../cache/transcripts.json');
const SUMMARY_CACHE_FILE = path.join(__dirname, '../cache/summaries.json');

// Ensure cache directory exists
const cacheDir = path.dirname(CACHE_FILE);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Improved cache loading with chunk support
function loadCacheFromFile(): Map<string, any> {
  const cache = new Map();
  const CHUNKS_DIR = path.join(__dirname, '../cache/chunks');
  
  // First try to load from chunks directory
  if (fs.existsSync(CHUNKS_DIR)) {
    logger.info('Found chunks directory, loading from chunks', { chunksDir: CHUNKS_DIR });
    
    try {
      const chunkFiles = fs.readdirSync(CHUNKS_DIR)
        .filter(file => file.startsWith('chunk_') && file.endsWith('.json'))
        .sort();
      
      logger.info('Found chunk files', { count: chunkFiles.length, files: chunkFiles });
      
      let totalEntries = 0;
      for (const chunkFile of chunkFiles) {
        const chunkPath = path.join(CHUNKS_DIR, chunkFile);
        const stats = fs.statSync(chunkPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        
        logger.info('Loading chunk', { file: chunkFile, size: `${fileSizeMB}MB` });
        
        try {
          const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
          let chunkEntries = 0;
          
          for (const [key, value] of Object.entries(chunkData)) {
            cache.set(key, value);
            chunkEntries++;
          }
          
          totalEntries += chunkEntries;
          logger.info('Loaded chunk successfully', { 
            file: chunkFile, 
            entries: chunkEntries, 
            totalEntries,
            size: `${fileSizeMB}MB` 
          });
        } catch (chunkError) {
          logger.error('Failed to load chunk', { 
            file: chunkFile, 
            error: chunkError instanceof Error ? chunkError.message : 'Unknown error' 
          });
        }
      }
      
      logger.info('Cache loaded successfully from chunks', {
        totalEntries,
        chunks: chunkFiles.length,
        chunksDir: CHUNKS_DIR
      });
      
      return cache;
    } catch (error) {
      logger.error('Failed to load from chunks', {
        error: error instanceof Error ? error.message : 'Unknown error',
        chunksDir: CHUNKS_DIR
      });
    }
  }
  
  // Fallback to main cache file
  if (!fs.existsSync(CACHE_FILE)) {
    logger.info('Cache file does not exist, starting with empty cache');
    return cache;
  }

  const stats = fs.statSync(CACHE_FILE);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);
  
  logger.info('Attempting to load cache from file', {
    size: `${fileSizeMB}MB`,
    file: CACHE_FILE
  });

  // If file is very large (>500MB), it might be corrupted
  if (stats.size > 500 * 1024 * 1024) {
    logger.warn('Cache file is very large, attempting to load with streaming parser', {
      size: `${fileSizeMB}MB`,
      file: CACHE_FILE
    });
    
    try {
      // Try to load with streaming parser for large files
      const fileContent = fs.readFileSync(CACHE_FILE, 'utf8');
      
      // Check if it's valid JSON
      if (!fileContent.trim().startsWith('{')) {
        throw new Error('Invalid JSON format');
      }
      
      // Try to parse in chunks
      const lines = fileContent.split('\n');
      let validEntries = 0;
      
      for (const line of lines) {
        if (line.trim() && line.includes('"id"')) {
          try {
            const entry = JSON.parse(line);
            if (entry.id && entry.ticker) {
              cache.set(entry.id, entry);
              validEntries++;
            }
          } catch (e) {
            // Skip invalid lines
            continue;
          }
        }
      }
      
      logger.info('Loaded cache with streaming parser', {
        entries: validEntries,
        fileSize: `${fileSizeMB}MB`,
        file: CACHE_FILE
      });
      
      return cache;
    } catch (error) {
      logger.error('Failed to parse large cache file', {
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestion: 'The file may be corrupted or too large for Node.js to handle'
      });
      
      // Create backup and start fresh
      const backupFile = `${CACHE_FILE}.backup.${Date.now()}`;
      try {
        fs.copyFileSync(CACHE_FILE, backupFile);
        logger.info('Created backup of corrupted cache file', { backupFile });
      } catch (backupError) {
        logger.warn('Failed to create backup', { error: backupError instanceof Error ? backupError.message : 'Unknown error' });
      }
      
      // Don't remove the file, just return empty cache
      logger.warn('Keeping original file but starting with empty cache');
      return cache;
    }
  }

  try {
    const fileContent = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(fileContent);
    
    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        cache.set(key, value);
      }
    }
    
    logger.info('Cache loaded successfully', {
      entries: cache.size,
      fileSize: `${fileSizeMB}MB`,
      file: CACHE_FILE
    });
  } catch (error) {
    logger.error('Failed to load cache from file', {
      error: error instanceof Error ? error.message : 'Unknown error',
      file: CACHE_FILE
    });
    
    // Create backup and start fresh
    const backupFile = `${CACHE_FILE}.backup.${Date.now()}`;
    try {
      fs.copyFileSync(CACHE_FILE, backupFile);
      logger.info('Created backup of corrupted cache file', { backupFile });
    } catch (backupError) {
      logger.warn('Failed to create backup', { error: backupError instanceof Error ? backupError.message : 'Unknown error' });
    }
    
    // Don't remove the file, just return empty cache
    logger.warn('Keeping original file but starting with empty cache');
  }
  
  return cache;
}

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

// Load summary cache from file
function loadSummaryCacheFromFile(): Map<string, any> {
  const cache = new Map();
  
  if (!fs.existsSync(SUMMARY_CACHE_FILE)) {
    logger.info('Summary cache file does not exist, starting with empty cache', { file: SUMMARY_CACHE_FILE });
    return cache;
  }
  
  try {
    const data = fs.readFileSync(SUMMARY_CACHE_FILE, 'utf8');
    const cacheData = JSON.parse(data);
    
    for (const [key, value] of Object.entries(cacheData)) {
      cache.set(key, value);
    }
    
    logger.info('Summary cache loaded successfully', { 
      entries: cache.size,
      file: SUMMARY_CACHE_FILE 
    });
  } catch (error) {
    logger.error('Failed to load summary cache from file', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      file: SUMMARY_CACHE_FILE 
    });
    
    // Create backup of corrupted file
    const backupFile = `${SUMMARY_CACHE_FILE}.backup.${Date.now()}`;
    try {
      fs.copyFileSync(SUMMARY_CACHE_FILE, backupFile);
      logger.info('Created backup of corrupted summary cache file', { backupFile });
    } catch (backupError) {
      logger.warn('Failed to create backup', { error: backupError instanceof Error ? backupError.message : 'Unknown error' });
    }
    
    logger.warn('Keeping original file but starting with empty summary cache');
  }
  
  return cache;
}

// Save summary cache to file
const saveSummaryCacheToFile = (cache: Map<string, any>): void => {
  try {
    // Convert Map to object for JSON serialization
    const cacheData = Object.fromEntries(cache.entries());
    fs.writeFileSync(SUMMARY_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    
    logger.info('Summary cache saved to file', { 
      entries: cache.size,
      file: SUMMARY_CACHE_FILE 
    });
  } catch (error) {
    logger.error('Failed to save summary cache to file', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      file: SUMMARY_CACHE_FILE 
    });
  }
};

// Initialize persistent cache
const transcriptCache = loadCacheFromFile();
// Clear summary cache on startup
const summaryCache = new Map();
saveSummaryCacheToFile(summaryCache);
logger.info('Summary cache cleared on startup');

// Initialize Google AI service
const googleAIService = new GoogleAIService();

// Initialize job manager
const jobManager = new JobManager(transcriptCache);
const enhancedJobManager = new EnhancedJobManager(transcriptCache);

// Initialize bulk AI service
const bulkAIService = new BulkAIService(transcriptCache);

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

// Optimized bulk fetch with parallel processing (direct endpoint)
app.post('/api/tickers/bulk-fetch', async (req, res) => {
  try {
    const { tickers } = req.body;
    
    if (!tickers || !Array.isArray(tickers)) {
      return res.status(400).json({ error: 'Tickers array is required' });
    }

    logger.info('Bulk fetch request received', { 
      tickers, 
      mode: config.apiNinjas.isDemo ? 'demo' : 'production',
      tickerCount: tickers.length 
    });

    const results = [];
    const startTime = Date.now();

    // Process tickers in parallel batches to speed up processing
    const BATCH_SIZE = 25; // Process 25 tickers at once (reduced from 50 to avoid rate limiting)
    const batches = [];
    
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      batches.push(tickers.slice(i, i + BATCH_SIZE));
    }

    logger.info('Processing tickers in parallel batches', {
      totalTickers: tickers.length,
      batchCount: batches.length,
      batchSize: BATCH_SIZE
    });

    // Process batches sequentially but tickers within each batch in parallel
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.info(`Processing batch ${batchIndex + 1}/${batches.length}`, { 
        batchTickers: batch,
        batchSize: batch.length 
      });

      // Process tickers in this batch in parallel
      const batchPromises = batch.map(async (ticker) => {
        logger.info('Processing ticker', { ticker });
        
        // Check if this ticker already has ANY transcripts in cache
        const existingTranscripts = [];
        for (const [cacheKey, transcript] of transcriptCache.entries()) {
          if (transcript.ticker && transcript.ticker.toLowerCase() === ticker.toLowerCase()) {
            existingTranscripts.push(transcript);
          }
        }
        
        if (existingTranscripts.length > 0) {
          logger.info('Ticker already has transcripts in cache, skipping entirely', {
            ticker,
            existingCount: existingTranscripts.length,
            quarters: existingTranscripts.map(t => `${t.year}-Q${t.quarter}`).join(', ')
          });
          
          // Add existing transcripts to results as "skipped"
          return existingTranscripts.map(transcript => ({
            ticker: ticker.toUpperCase(),
            year: transcript.year,
            quarter: transcript.quarter,
            status: 'success',
            transcriptLength: transcript.fullTranscript.length,
            transcriptId: transcript.id,
            storage: 'cached',
            skipped: true,
          }));
        }
        
        logger.info('Fetching latest transcripts for new ticker', { ticker });
        
        try {
          // Smart quarter strategy - try multiple recent quarters in order of likelihood
          // Different companies have different fiscal year ends, so we need to try multiple quarters
          const quartersToTry = getLastFourQuarters(ticker).slice(0, 16); // Try all 16 quarters like Python project
          // Process quarters sequentially to avoid rate limiting issues
          const fetchedTranscripts = [];
          for (const quarter of quartersToTry) {
            try {
              logger.info(`Fetching ${ticker} ${quarter.year} Q${quarter.quarter}...`);
              const transcript = await apiNinjasService.fetchTranscript(ticker, quarter.year, quarter.quarter);
              if (transcript && transcript.transcript) {
                fetchedTranscripts.push({
                  ...transcript,
                  ticker: ticker.toUpperCase(),
                  year: quarter.year,
                  quarter: quarter.quarter,
                  callDate: transcript.date || `${quarter.year}-${quarter.quarter.toString().padStart(2, '0')}-01`,
                  id: `${ticker.toUpperCase()}_${quarter.year}_Q${quarter.quarter}`,
                });
                logger.info(`✅ Successfully fetched ${ticker} ${quarter.year} Q${quarter.quarter}`);
                break; // Found transcript, no need to try other quarters
              }
            } catch (error) {
              logger.warn(`❌ Failed to fetch ${ticker} ${quarter.year} Q${quarter.quarter}: ${error instanceof Error ? error.message : 'Unknown error'}`);
              // Continue to next quarter if available
            }
          }
          
          // Process the successfully fetched transcripts
          const tickerResults = [];
          for (const transcript of fetchedTranscripts) {
            if (!transcript) continue;
            
            const cacheKey = `${transcript.ticker.toLowerCase()}-${transcript.year}-Q${transcript.quarter}`;
            
            // Parse transcript date
            let callDate: Date | null = null;
            if (transcript.date) {
              try {
                callDate = new Date(transcript.date);
              } catch (error) {
                logger.warn('Invalid date format in transcript', {
                  ticker,
                  year: transcript.year,
                  quarter: transcript.quarter,
                  date: transcript.date,
                });
                callDate = new Date(`${transcript.year}-${transcript.quarter * 3}-15`);
              }
            } else {
              callDate = new Date(`${transcript.year}-${transcript.quarter * 3}-15`);
            }

            // Store in memory cache
            transcriptCache.set(cacheKey, {
              id: cacheKey,
              ticker: transcript.ticker,
              year: transcript.year,
              quarter: transcript.quarter,
              callDate: callDate,
              fullTranscript: transcript.transcript,
              transcriptJson: {
                ticker: transcript.ticker,
                year: transcript.year,
                quarter: transcript.quarter,
                date: transcript.date,
                transcript: transcript.transcript,
                fetchedAt: new Date().toISOString(),
              },
            });

            // Also save to database
            let savedTranscriptId = cacheKey;
            let storageLocation = 'memory';
            
            try {
              const savedTranscript = await prisma.transcript.upsert({
                where: {
                  ticker_year_quarter: {
                    ticker: transcript.ticker.toUpperCase(),
                    year: transcript.year,
                    quarter: transcript.quarter,
                  },
                },
                update: {
                  fullTranscript: transcript.transcript,
                  callDate,
                  updatedAt: new Date(),
                },
                create: {
                  ticker: transcript.ticker.toUpperCase(),
                  year: transcript.year,
                  quarter: transcript.quarter,
                  fullTranscript: transcript.transcript,
                  callDate,
                  transcriptJson: {},
                },
              });

              savedTranscriptId = savedTranscript.id;
              storageLocation = 'database';
              
              logger.info('Transcript saved to database from bulk fetch', {
                ticker,
                year: transcript.year,
                quarter: transcript.quarter,
                transcriptId: savedTranscript.id
              });
            } catch (dbError) {
              logger.error('Failed to save transcript to database during bulk fetch', {
                ticker,
                year: transcript.year,
                quarter: transcript.quarter,
                error: dbError instanceof Error ? dbError.message : 'Unknown error'
              });
              // Continue with cache storage
            }
            
            tickerResults.push({
              ticker: transcript.ticker,
              year: transcript.year,
              quarter: transcript.quarter,
              status: 'success',
              transcriptLength: transcript.transcript.length,
              transcriptId: savedTranscriptId,
              storage: storageLocation,
            });
            
            logger.info('Transcript stored in memory cache', {
              ticker: transcript.ticker,
              year: transcript.year,
              quarter: transcript.quarter,
              length: transcript.transcript.length,
              cacheKey,
            });
          }
          
          // If no transcripts were found for this ticker
          if (fetchedTranscripts.length === 0) {
            tickerResults.push({
              ticker: ticker.toUpperCase(),
              status: 'not_available',
              error: 'No transcript data available for any recent quarters',
            });
          }
          
          return tickerResults;
        } catch (error) {
          logger.error('Error fetching transcripts for ticker', {
            ticker,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          
          return [{
            ticker: ticker.toUpperCase(),
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          }];
        }
      });

      // Wait for all tickers in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Flatten results from this batch
      for (const tickerResults of batchResults) {
        results.push(...tickerResults);
      }

      // Minimal delay between batches to respect rate limits
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 25)); // Reduced from 50ms to 25ms
      }
    }

    // Save cache to file periodically (not on every request)
    try {
      if (transcriptCache.size > 0 && transcriptCache.size % 10 === 0) {
        saveCacheToFile(transcriptCache);
      }
    } catch (error) {
      logger.warn('Failed to save cache to file', { error: error instanceof Error ? error.message : 'Unknown error' });
    }

    const executionTime = Date.now() - startTime;
    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const notAvailable = results.filter(r => r.status === 'not_available').length;
    const skipped = results.filter(r => (r as any).skipped).length;

    logger.info('Bulk fetch completed', {
      total: results.length,
      successful,
      failed,
      notAvailable,
      executionTime,
      averageTimePerTicker: executionTime / tickers.length,
    });

    res.json({
      results,
      summary: {
        total: results.length,
        successful,
        failed,
        notAvailable,
        skipped,
      },
      executionTime,
      averageTimePerTicker: executionTime / tickers.length,
    });
  } catch (error) {
    logger.error('Bulk fetch error', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create background job endpoint
app.post('/api/jobs/bulk-fetch', asyncHandler(async (req, res) => {
  const { tickers: rawTickers } = req.body;
  const tickers = Array.isArray(rawTickers) ? rawTickers.map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];

  if (tickers.length === 0) {
    return res.status(400).json({ error: 'No tickers provided' });
  }

  try {
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
  } catch (error) {
    res.status(400).json({ 
      error: error instanceof Error ? error.message : 'Failed to create job',
      suggestion: 'Wait for current job to complete or check /api/jobs for active jobs'
    });
  }
}));

// Clear completed jobs
app.delete('/api/jobs/completed', asyncHandler(async (req, res) => {
  const clearedCount = jobManager.clearCompletedJobs();
  res.json({ 
    message: `Cleared ${clearedCount} completed jobs`,
    clearedCount 
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

// Cancel job
app.post('/api/jobs/:jobId/cancel', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const cancelled = jobManager.cancelJob(jobId);

  if (!cancelled) {
    return res.status(400).json({ error: 'Job cannot be cancelled (not running/pending or not found)' });
  }

  res.json({ message: 'Job cancelled successfully', jobId });
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

// Enhanced bulk file upload endpoints
app.post('/api/jobs/bulk-upload', asyncHandler(async (req, res) => {
  const { fileContent, quarterCount = 1 } = req.body;
  
  if (!fileContent || typeof fileContent !== 'string') {
    return res.status(400).json({ error: 'File content is required' });
  }

  if (quarterCount && (typeof quarterCount !== 'number' || quarterCount < 1 || quarterCount > 12)) {
    return res.status(400).json({ error: 'Quarter count must be between 1 and 12' });
  }

  try {
    logger.info('Creating bulk upload job', { 
      fileLength: fileContent.length,
      quarterCount,
      estimatedTickers: fileContent.split('\n').length
    });
    
    const jobId = enhancedJobManager.createBulkFetchJobFromFile(fileContent, quarterCount);
    
    logger.info('Bulk upload job created successfully', { jobId });
    
    res.json({ 
      message: 'Bulk upload job created successfully', 
      jobId,
      status: 'pending'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create bulk upload job', { 
      error: errorMessage,
      fileLength: fileContent.length,
      quarterCount
    });
    res.status(500).json({ error: errorMessage });
  }
}));

// Enhanced job progress endpoint
app.get('/api/jobs/:jobId/progress', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  
  const progress = enhancedJobManager.getJobProgress(jobId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(progress);
}));

// Enhanced job control endpoints
app.post('/api/jobs/:jobId/pause', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  
  const paused = enhancedJobManager.pauseJob(jobId);
  
  if (!paused) {
    return res.status(400).json({ error: 'Job cannot be paused (not running or not found)' });
  }

  res.json({ message: 'Job paused successfully', jobId });
}));

app.post('/api/jobs/:jobId/resume', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  
  const resumed = enhancedJobManager.resumeJob(jobId);
  
  if (!resumed) {
    return res.status(400).json({ error: 'Job cannot be resumed (not paused or not found)' });
  }

  res.json({ message: 'Job resumed successfully', jobId });
}));

app.post('/api/jobs/:jobId/cancel', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  
  const cancelled = enhancedJobManager.cancelJob(jobId);
  
  if (!cancelled) {
    return res.status(400).json({ error: 'Job cannot be cancelled (not running/pending or not found)' });
  }

  res.json({ message: 'Job cancelled successfully', jobId });
}));

// Enhanced jobs list endpoint
app.get('/api/jobs/enhanced', asyncHandler(async (req, res) => {
  const jobs = enhancedJobManager.getAllJobs();
  res.json({
    jobs: jobs.map(job => ({
      id: job.id,
      status: job.status,
      tickerCount: job.tickers.length,
      progress: `${job.progress.current}/${job.progress.total}`,
      processed: job.progress.processed.length,
      failed: job.progress.failed.length,
      skipped: job.progress.skipped.length,
      processedTickers: job.progress.processed, // Return actual ticker names
      failedTickers: job.progress.failed, // Return actual ticker names
      skippedTickers: job.progress.skipped, // Return actual ticker names
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      currentTicker: job.progress.currentTicker
    }))
  });
}));

// Enhanced search endpoint that works with database (transcripts + AI summaries)
app.post('/api/search/enhanced', asyncHandler(async (req, res) => {
  const { query, type = 'keyword', source = 'transcripts', filters = {}, options = {} } = req.body;
  
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required' });
  }

  const searchFilters = {
    tickers: filters.tickers,
    years: filters.years,
    quarters: filters.quarters,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    limit: filters.limit || 20,
    offset: filters.offset || 0,
  };

  const startTime = Date.now();
  
  let results;
  
  // Choose search method based on source parameter
  switch (source) {
    case 'ai_summaries':
      results = await searchService.searchAISummaries(query, searchFilters, options.highlight ?? true);
      break;
    case 'both':
      results = await searchService.searchCombined(query, searchFilters, options.highlight ?? true);
      break;
    default: // 'transcripts'
      switch (type) {
        case 'regex':
          results = await searchService.searchRegex(query, searchFilters, options.highlight ?? true);
          break;
        case 'fuzzy':
          results = await searchService.searchFuzzy(query, searchFilters, options);
          break;
        default:
          results = await searchService.searchKeywords(query, searchFilters, options.highlight ?? true);
      }
  }

  const executionTime = Date.now() - startTime;

  res.json({
    ...results,
    executionTime,
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
    
    // Handle phrase search differently
    if (req.body.searchType === 'phrase') {
      const phrase = query.trim();
      if (!phrase) {
        return res.status(400).json({ error: 'Phrase is required' });
      }

      const results: any[] = [];

      // Create regex pattern for exact phrase matching (case insensitive)
      const phrasePattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      // Search through cached transcripts
      for (const [cacheKey, transcript] of transcriptCache.entries()) {
        const fullText = transcript.fullTranscript.toLowerCase();
        
        // Apply filters
        if (filters.tickers && filters.tickers.length > 0) {
          const filterTickers = filters.tickers.map((t: string) => t.toLowerCase());
          if (!filterTickers.includes(transcript.ticker.toLowerCase())) continue;
        }
        if (filters.years && filters.years.length > 0) {
          if (!filters.years.includes(transcript.year)) continue;
        }
        if (filters.quarters && filters.quarters.length > 0) {
          if (!filters.quarters.includes(transcript.quarter)) continue;
        }

        // Check if phrase exists in transcript
        const matches = fullText.match(phrasePattern);
        if (matches && matches.length > 0) {
          // Find first phrase position for snippet
          const firstMatch = phrasePattern.exec(transcript.fullTranscript);
          if (firstMatch) {
            const index = firstMatch.index;
            const start = Math.max(0, index - 100);
            const end = Math.min(transcript.fullTranscript.length, index + 200);
            
            let snippet = transcript.fullTranscript.substring(start, end);
            if (highlight) {
              // Highlight the exact phrase
              const highlightPattern = new RegExp(`(${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
              snippet = snippet.replace(highlightPattern, '<mark>$1</mark>');
            }

                    results.push({
          id: cacheKey,
          ticker: transcript.ticker,
          companyName: transcript.companyName,
          year: transcript.year,
          quarter: transcript.quarter,
          callDate: transcript.callDate,
          snippet: snippet,
          relevanceScore: matches.length / transcript.fullTranscript.length * 1000,
          totalMatchCount: matches.length,
          keywordMatches: [{
            keyword: phrase,
            matchCount: matches.length,
            score: matches.length / transcript.fullTranscript.length * 1000
          }],
        });
          }
        }
      }

      // Sort results based on sortBy parameter
      if (sortBy === 'date') {
        results.sort((a, b) => {
          if (a.year !== b.year) {
            return b.year - a.year;
          }
          return b.quarter - a.quarter;
        });
      } else {
        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      }

      // Apply pagination
      const limit = filters.limit || 20;
      const offset = filters.offset || 0;
      const paginatedResults = results.slice(offset, offset + limit);

      const executionTime = Date.now() - startTime;

      logger.info('Phrase search completed', {
        phrase,
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
        query: phrase,
        filters,
        sortBy,
      });
      return;
    }
    
    // Split query into individual keywords for regular search
    const keywords = query.split(/\s+/).map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    
    if (keywords.length === 0) {
      return res.status(400).json({ error: 'At least one keyword is required' });
    }

    // Get required and optional keywords from filters
    const requiredKeywords = filters.requiredKeywords || [];
    const optionalKeywords = filters.optionalKeywords || [];

    const results: any[] = [];

    // Create regex patterns with word boundaries for each keyword
    const keywordPatterns = keywords.map(keyword => ({
      keyword,
      pattern: new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    }));

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

      // Check if all required keywords exist in transcript
      let allRequiredKeywordsFound = true;
      if (requiredKeywords.length > 0) {
        for (const requiredKeyword of requiredKeywords) {
          const pattern = new RegExp(`\\b${requiredKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
          if (!pattern.test(transcript.fullTranscript)) {
            allRequiredKeywordsFound = false;
            break;
          }
        }
      }

      // Skip if not all required keywords are found
      if (!allRequiredKeywordsFound) {
        continue;
      }

      // Check keyword matches for scoring
      const keywordMatches: any[] = [];
      let totalMatches = 0;

      for (const { keyword, pattern } of keywordPatterns) {
        const matches = fullText.match(pattern);
        const matchCount = matches ? matches.length : 0;
        
        totalMatches += matchCount;
        
        keywordMatches.push({
          keyword,
          matchCount,
          score: matchCount / transcript.fullTranscript.length * 1000
        });
      }

      // Find first match position for snippet
      let firstMatchIndex = -1;
      for (const { keyword, pattern } of keywordPatterns) {
        const match = pattern.exec(transcript.fullTranscript);
        if (match && (firstMatchIndex === -1 || match.index < firstMatchIndex)) {
          firstMatchIndex = match.index;
        }
      }

      if (firstMatchIndex !== -1) {
        const start = Math.max(0, firstMatchIndex - 100);
        const end = Math.min(transcript.fullTranscript.length, firstMatchIndex + 200);
        
        let snippet = transcript.fullTranscript.substring(start, end);
        if (highlight) {
          // Highlight all keyword matches
          for (const { keyword } of keywordMatches) {
            const highlightPattern = new RegExp(`\\b(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');
            snippet = snippet.replace(highlightPattern, '<mark>$1</mark>');
          }
        }

        results.push({
          id: cacheKey,
          ticker: transcript.ticker,
          companyName: transcript.companyName,
          year: transcript.year,
          quarter: transcript.quarter,
          callDate: transcript.callDate,
          snippet: snippet,
          relevanceScore: totalMatches / transcript.fullTranscript.length * 1000,
          totalMatchCount: totalMatches,
          keywordMatches: keywordMatches,
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

// Search transcripts by ticker - database first, then cache fallback
app.get('/api/transcripts/ticker/:ticker', asyncHandler(async (req, res) => {
  const { ticker } = req.params;
  const { limit = 10, offset = 0, sortBy = 'callDate', sortOrder = 'desc' } = req.query;

  if (!ticker || ticker.length === 0) {
    return res.status(400).json({ error: 'Ticker is required' });
  }

  const tickerUpper = ticker.toUpperCase();
  logger.info('Searching transcripts by ticker', { ticker: tickerUpper, limit, offset });

  try {
    // Search database first using the transcript service
    const dbResults = await prisma.transcript.findMany({
      where: {
        ticker: {
          equals: tickerUpper,
          mode: 'insensitive'
        }
      },
      orderBy: {
        [sortBy as string]: sortOrder as 'asc' | 'desc'
      },
      take: Number(limit),
      skip: Number(offset),
      select: {
        id: true,
        ticker: true,
        companyName: true,
        year: true,
        quarter: true,
        callDate: true,
        fullTranscript: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Count total results for pagination
    const totalCount = await prisma.transcript.count({
      where: {
        ticker: {
          equals: tickerUpper,
          mode: 'insensitive'
        }
      }
    });

    // If we found results in database, return them
    if (dbResults.length > 0) {
      const formattedResults = dbResults.map(transcript => ({
        id: transcript.id,
        ticker: transcript.ticker,
        companyName: transcript.companyName,
        year: transcript.year,
        quarter: transcript.quarter,
        callDate: transcript.callDate,
        transcriptLength: transcript.fullTranscript?.length || 0,
        createdAt: transcript.createdAt,
        updatedAt: transcript.updatedAt,
        source: 'database'
      }));

      return res.json({
        ticker: tickerUpper,
        transcripts: formattedResults,
        total: totalCount,
        page: Math.floor(Number(offset) / Number(limit)) + 1,
        limit: Number(limit),
        source: 'database'
      });
    }

    // Fallback: search cache if nothing in database
    const cacheResults = [];
    for (const [cacheKey, transcript] of transcriptCache.entries()) {
      if (transcript.ticker && transcript.ticker.toUpperCase() === tickerUpper) {
        cacheResults.push({
          id: cacheKey,
          ticker: transcript.ticker.toUpperCase(),
          companyName: transcript.companyName || null,
          year: transcript.year,
          quarter: transcript.quarter,
          callDate: transcript.callDate,
          transcriptLength: transcript.fullTranscript?.length || 0,
          createdAt: null,
          updatedAt: null,
          source: 'cache'
        });
      }
    }

    // Sort cache results
    cacheResults.sort((a, b) => {
      if (sortBy === 'callDate') {
        const dateA = new Date(a.callDate || 0);
        const dateB = new Date(b.callDate || 0);
        return sortOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
      }
      // Add other sorting options as needed
      return 0;
    });

    // Apply pagination to cache results
    const paginatedCacheResults = cacheResults.slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      ticker: tickerUpper,
      transcripts: paginatedCacheResults,
      total: cacheResults.length,
      page: Math.floor(Number(offset) / Number(limit)) + 1,
      limit: Number(limit),
      source: cacheResults.length > 0 ? 'cache' : 'none'
    });

  } catch (error) {
    logger.error('Error searching transcripts by ticker', {
      ticker: tickerUpper,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ error: 'Failed to search transcripts' });
  }
}));

// Force save cache to file
app.post('/api/transcripts/save-cache', (req, res) => {
  try {
    saveCacheToFile(transcriptCache);
    res.json({
      success: true,
      message: 'Cache saved successfully',
      entries: transcriptCache.size,
      file: CACHE_FILE,
      fileExists: fs.existsSync(CACHE_FILE)
    });
  } catch (error) {
    logger.error('Failed to save cache', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({
      success: false,
      error: 'Failed to save cache',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get individual transcript by ID - database first, then cache fallback
app.get('/api/transcripts/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  logger.info('Fetching transcript by ID', { id });
  
  try {
    // First, try to find in database (for UUID IDs)
    if (id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      const dbTranscript = await prisma.transcript.findUnique({
        where: { id },
        select: {
          id: true,
          ticker: true,
          companyName: true,
          year: true,
          quarter: true,
          callDate: true,
          fullTranscript: true,
          createdAt: true,
          updatedAt: true
        }
      });
      
      if (dbTranscript) {
        logger.info('Transcript retrieved from database', {
          id,
          ticker: dbTranscript.ticker,
          year: dbTranscript.year,
          quarter: dbTranscript.quarter,
          length: dbTranscript.fullTranscript?.length || 0,
        });
        
        return res.json({
          id: dbTranscript.id,
          ticker: dbTranscript.ticker,
          companyName: dbTranscript.companyName,
          year: dbTranscript.year,
          quarter: dbTranscript.quarter,
          callDate: dbTranscript.callDate,
          fullTranscript: dbTranscript.fullTranscript,
          createdAt: dbTranscript.createdAt,
          updatedAt: dbTranscript.updatedAt,
          source: 'database'
        });
      }
    }
    
    // Fallback: try cache (for cache key format like "ftnt-2025-Q2")
    if (transcriptCache.has(id)) {
      const transcript = transcriptCache.get(id);
      
      logger.info('Transcript retrieved from cache', {
        id,
        ticker: transcript.ticker,
        year: transcript.year,
        quarter: transcript.quarter,
        length: transcript.fullTranscript?.length || 0,
      });
      
      return res.json({
        id: transcript.id,
        ticker: transcript.ticker,
        companyName: transcript.companyName,
        year: transcript.year,
        quarter: transcript.quarter,
        fullTranscript: transcript.fullTranscript,
        callDate: transcript.callDate,
        source: 'cache'
      });
    }
    
    // Not found in database or cache
    return res.status(404).json({ error: 'Transcript not found' });
    
  } catch (error) {
    logger.error('Error retrieving transcript', { 
      id: req.params.id,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    res.status(500).json({ error: 'Failed to retrieve transcript' });
  }
}));

// Summarize transcript using Ollama
app.post('/api/transcripts/:id/summarize', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { searchQuery } = req.body;
  
  if (!transcriptCache.has(id)) {
    return res.status(404).json({ error: 'Transcript not found' });
  }
  
  const transcript = transcriptCache.get(id);
  
  // Create cache key for this summary
  const summaryCacheKey = `${id}:${searchQuery || 'general'}`;
  
  // Check if summary already exists in cache
  if (summaryCache.has(summaryCacheKey)) {
    const cachedSummary = summaryCache.get(summaryCacheKey);
    logger.info('Returning cached summary', {
      id,
      ticker: transcript.ticker,
      year: transcript.year,
      quarter: transcript.quarter,
      searchQuery: searchQuery || 'none',
      cacheKey: summaryCacheKey
    });
    
    return res.json({
      success: true,
      summary: cachedSummary.summary,
      model: cachedSummary.model,
      ticker: transcript.ticker,
      quarter: `${transcript.year}Q${transcript.quarter}`,
      searchQuery: searchQuery || null,
      cached: true
    });
  }
  
  logger.info('Generating summary for transcript', {
    id,
    ticker: transcript.ticker,
    year: transcript.year,
    quarter: transcript.quarter,
    searchQuery: searchQuery || 'none'
  });
  
  try {
    // Check if Ollama is available
    const healthCheck = await googleAIService.healthCheck();
    if (!healthCheck.available) {
      return res.status(503).json({
        error: 'Ollama service unavailable',
        details: healthCheck.error
      });
    }
    
          const summary = await googleAIService.summarizeTranscript(
      transcript.ticker,
      `${transcript.year}Q${transcript.quarter}`,
      transcript.fullTranscript,
      searchQuery
    );
    
    // Cache the summary
    const summaryData = {
      summary,
      model: healthCheck.model,
      ticker: transcript.ticker,
      year: transcript.year,
      quarter: transcript.quarter,
      searchQuery: searchQuery || null,
      createdAt: new Date().toISOString()
    };
    
    summaryCache.set(summaryCacheKey, summaryData);
    
    // Save cache to file
    saveSummaryCacheToFile(summaryCache);
    
    logger.info('Summary generated and cached', {
      id,
      ticker: transcript.ticker,
      year: transcript.year,
      quarter: transcript.quarter,
      searchQuery: searchQuery || 'none',
      cacheKey: summaryCacheKey,
      summaryLength: summary.length
    });
    
    res.json({
      success: true,
      summary,
      model: healthCheck.model,
      ticker: transcript.ticker,
      quarter: `${transcript.year}Q${transcript.quarter}`,
      searchQuery: searchQuery || null,
      cached: false
    });
    
  } catch (error) {
    logger.error('Failed to generate summary', {
      id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Failed to generate summary',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Generate multiple AI summaries for a transcript
app.post('/api/transcripts/:id/multiple-summaries', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { searchQuery, forceRefresh } = req.body;
  
  // Retrieve transcript: try database first for UUIDs, then cache fallback
  let transcript: any = null;
  if (id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    const dbTranscript = await prisma.transcript.findUnique({ where: { id } });
    if (dbTranscript) {
      transcript = {
        id: dbTranscript.id,
        ticker: dbTranscript.ticker,
        year: dbTranscript.year,
        quarter: dbTranscript.quarter,
        callDate: dbTranscript.callDate,
        fullTranscript: dbTranscript.fullTranscript,
        transcriptJson: dbTranscript.transcriptJson,
        source: 'database'
      };
    }
  }

  if (!transcript && transcriptCache.has(id)) {
    const cached = transcriptCache.get(id);
    transcript = { ...cached, source: 'cache' };
  }

  if (!transcript) {
    return res.status(404).json({ error: 'Transcript not found' });
  }
  
  logger.info('Generating multiple AI summaries for transcript', {
    id,
    ticker: transcript.ticker,
    year: transcript.year,
    quarter: transcript.quarter,
    searchQuery: searchQuery || 'none',
    forceRefresh: forceRefresh || false
  });
  
  try {
    // First, ensure the transcript exists in the database
    const existingTranscript = await prisma.transcript.findUnique({
      where: { id }
    });

    if (!existingTranscript) {
      // Save transcript from memory cache to database
      const transcriptFromCache = transcriptCache.get(id);
      if (transcriptFromCache) {
        await prisma.transcript.create({
          data: {
            id: transcriptFromCache.id,
            ticker: transcriptFromCache.ticker,
            companyName: transcriptFromCache.ticker, // Use ticker as fallback
            year: transcriptFromCache.year,
            quarter: transcriptFromCache.quarter,
            callDate: transcriptFromCache.callDate,
            fullTranscript: transcriptFromCache.fullTranscript,
            transcriptJson: transcriptFromCache.transcriptJson,
            transcriptSplit: undefined
          }
        });
        
        logger.info('Transcript saved to database from cache', {
          id: transcriptFromCache.id,
          ticker: transcriptFromCache.ticker,
          year: transcriptFromCache.year,
          quarter: transcriptFromCache.quarter
        });
      }
    }

    // Check if summaries already exist in database (unless force refresh)
    if (!forceRefresh) {
      const existingSummaries = await googleAIService.getAISummariesFromDatabase(id);
      if (existingSummaries.length >= 4) {
        logger.info('Found existing AI summaries, asking for confirmation', {
          id,
          ticker: transcript.ticker,
          summariesCount: existingSummaries.length,
          analystTypes: existingSummaries.map(s => s.analystType)
        });

        return res.status(409).json({
          success: false,
          error: 'summaries_exist',
          message: 'AI summaries already exist for this transcript. Would you like to regenerate them?',
          ticker: transcript.ticker,
          quarter: `${transcript.year}Q${transcript.quarter}`,
          existingSummaries: existingSummaries.map(s => ({
            analystType: s.analystType,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString()
          })),
          existingCount: existingSummaries.length
        });
      } else if (existingSummaries.length > 0) {
        logger.info('Returning existing AI summaries from database', {
          id,
          ticker: transcript.ticker,
          summariesCount: existingSummaries.length,
          analystTypes: existingSummaries.map(s => s.analystType)
        });

        // Convert to format expected by frontend
        const responses = existingSummaries.map((summary, index) => ({
          id: index + 1,
          timestamp: summary.createdAt.toISOString(),
          content: summary.content,
          processingTime: summary.processingTime,
          hasHiddenGoldmine: summary.hasHiddenGoldmine,
          hasBoringQuote: summary.hasBoringQuote,
          hasSizePotential: summary.hasSizePotential,
          analystType: summary.analystType
        }));

        return res.json({
          success: true,
          multipleSummaries: {
            responses,
            totalProcessingTime: existingSummaries.reduce((sum, s) => sum + s.processingTime, 0),
            averageProcessingTime: existingSummaries.reduce((sum, s) => sum + s.processingTime, 0) / existingSummaries.length,
            successCount: existingSummaries.length,
            failureCount: 0
          },
          model: 'gemini-1.5-flash',
          ticker: transcript.ticker,
          quarter: `${transcript.year}Q${transcript.quarter}`,
          searchQuery: searchQuery || null,
          cached: true
        });
      }
    }

    // Check if Google AI is available
    const healthCheck = await googleAIService.healthCheck();
    if (!healthCheck.available) {
      return res.status(503).json({
        error: 'Google AI service unavailable',
        details: healthCheck.error
      });
    }
    
    const multipleSummaries = await googleAIService.generateMultipleSummaries(
      transcript.ticker,
      `${transcript.year}Q${transcript.quarter}`,
      transcript.fullTranscript,
      searchQuery
    );

    // Save summaries to database
    await googleAIService.saveAISummariesToDatabase(
      id,
      multipleSummaries.responses,
      searchQuery,
      multipleSummaries.synthesizedThesis
    );
    
    logger.info('Multiple AI summaries completed and saved to database', {
      id,
      ticker: transcript.ticker,
      year: transcript.year,
      quarter: transcript.quarter,
      searchQuery: searchQuery || 'none',
      totalProcessingTime: multipleSummaries.totalProcessingTime,
      successCount: multipleSummaries.successCount,
      failureCount: multipleSummaries.failureCount
    });
    
    res.json({
      success: true,
      multipleSummaries,
      model: healthCheck.model,
      ticker: transcript.ticker,
      quarter: `${transcript.year}Q${transcript.quarter}`,
      searchQuery: searchQuery || null,
      cached: false
    });
    
  } catch (error) {
    logger.error('Failed to generate multiple summaries', {
      id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Failed to generate multiple summaries',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Get Google AI health status
app.get('/api/google-ai/health', asyncHandler(async (req, res) => {
  const healthCheck = await googleAIService.healthCheck();

  res.json({
    available: healthCheck.available,
          model: healthCheck.model || 'gemma-3-27b-it',
    error: healthCheck.error
  });
}));

// Get cached summaries for a transcript
app.get('/api/transcripts/:id/summaries', asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  if (!transcriptCache.has(id)) {
    return res.status(404).json({ error: 'Transcript not found' });
  }
  
  const transcript = transcriptCache.get(id);
  const summaries = [];
  
  // Find all cached summaries for this transcript
  for (const [key, value] of summaryCache.entries()) {
    if (key.startsWith(`${id}:`)) {
      const searchQuery = key.split(':')[1];
      summaries.push({
        searchQuery: searchQuery === 'general' ? null : searchQuery,
        summary: value.summary,
        model: value.model,
        createdAt: value.createdAt,
        cached: true
      });
    }
  }
  
  res.json({
    success: true,
    transcriptId: id,
    ticker: transcript.ticker,
    quarter: `${transcript.year}Q${transcript.quarter}`,
    summaries
  });
}));

// Clear summary cache for a specific transcript or all summaries
app.delete('/api/summaries/cache', asyncHandler(async (req, res) => {
  const { transcriptId } = req.query;
  
  if (transcriptId) {
    // Clear summaries for specific transcript
    const keysToDelete = [];
    for (const key of summaryCache.keys()) {
      if (key.startsWith(`${transcriptId}:`)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => summaryCache.delete(key));
    
    logger.info('Cleared summary cache for transcript', {
      transcriptId,
      deletedCount: keysToDelete.length
    });
    
    res.json({
      success: true,
      message: `Cleared ${keysToDelete.length} summaries for transcript ${transcriptId}`
    });
  } else {
    // Clear all summaries
    const count = summaryCache.size;
    summaryCache.clear();
    
    logger.info('Cleared all summary cache', { count });
    
    res.json({
      success: true,
      message: `Cleared all ${count} cached summaries`
    });
  }
  
  // Save updated cache to file
  saveSummaryCacheToFile(summaryCache);
}));

// Helper function to get last four quarters using generalized approach
const getLastFourQuarters = (ticker?: string) => {
  const { getQuartersToTryForTicker } = require('./services/quarterCalculator');
  return getQuartersToTryForTicker(ticker || 'GENERAL', 4);
};

// Tickers API endpoints
app.get('/api/tickers', asyncHandler(async (req, res) => {
  const { search, limit = 50, offset = 0 } = req.query;
  
  const result = await transcriptService.getAvailableTickers({
    search: search as string | undefined,
    limit: parseInt(limit as string),
    offset: parseInt(offset as string),
  });
  
  res.json(result);
}));

app.get('/api/tickers/:ticker', asyncHandler(async (req, res) => {
  const { ticker } = req.params;
  
  if (!ticker || ticker.length > 10) {
    return res.status(400).json({ error: 'Invalid ticker format' });
  }
  
  const tickerUpper = ticker.toUpperCase();
  const details = await transcriptService.getTickerDetails(tickerUpper);
  
  if (!details) {
    return res.status(404).json({ error: 'Ticker not found' });
  }
  
  // Add fiscal year information
  const { getFiscalYearInfo } = require('./services/quarterCalculator');
  const fiscalYearInfo = getFiscalYearInfo(tickerUpper);
  
  res.json({
    ...details,
    fiscalYear: fiscalYearInfo
  });
}));

app.post('/api/tickers/:ticker/refresh', asyncHandler(async (req, res) => {
  const { ticker } = req.params;
  const { quarters } = req.body;
  
  if (!ticker || ticker.length > 10) {
    return res.status(400).json({ error: 'Invalid ticker format' });
  }
  
  const tickerUpper = ticker.toUpperCase();
  const quartersToRefresh = quarters || getLastFourQuarters(tickerUpper);
  
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
}));

// Get fiscal year information for a ticker
app.get('/api/tickers/:ticker/fiscal-year', asyncHandler(async (req, res) => {
  const { ticker } = req.params;
  
  if (!ticker || ticker.length > 10) {
    return res.status(400).json({ error: 'Invalid ticker format' });
  }
  
  const tickerUpper = ticker.toUpperCase();
  const { getFiscalYearInfo, getLastFourQuarters, formatQuarter } = require('./services/quarterCalculator');
  
  const fiscalYearInfo = getFiscalYearInfo(tickerUpper);
  const recentQuarters = getLastFourQuarters(new Date(), tickerUpper);
  
  res.json({
    ticker: tickerUpper,
    fiscalYear: fiscalYearInfo,
    recentQuarters: recentQuarters.map((q: { year: number; quarter: number }) => ({
      ...q,
      formatted: formatQuarter(q.year, q.quarter, tickerUpper)
    })),
    example: {
      currentQuarter: formatQuarter(recentQuarters[0].year, recentQuarters[0].quarter, tickerUpper),
      previousQuarter: formatQuarter(recentQuarters[1].year, recentQuarters[1].quarter, tickerUpper)
    }
  });
}));

// Get fiscal year information using general pattern-based approach
app.post('/api/fiscal-year/calculate', asyncHandler(async (req, res) => {
  const { earningsCallDate, reportedQuarter, reportedYear } = req.body;
  
  if (!earningsCallDate || !reportedQuarter || !reportedYear) {
    return res.status(400).json({ 
      error: 'Missing required fields: earningsCallDate, reportedQuarter, reportedYear' 
    });
  }
  
  const { 
    calculateFiscalYearFromEarningsDate, 
    getFiscalYearOffsetFromPattern, 
    getFiscalYearInfoFromPattern,
    getLastFourQuarters,
    formatQuarter
  } = require('./services/quarterCalculator');
  
  const callDate = new Date(earningsCallDate);
  const pattern = { callDate, reportedQuarter, reportedYear };
  
  const fiscalYearData = calculateFiscalYearFromEarningsDate(callDate, reportedQuarter, reportedYear);
  const offset = getFiscalYearOffsetFromPattern(callDate, reportedQuarter, reportedYear);
  const fiscalYearInfo = getFiscalYearInfoFromPattern(pattern);
  const recentQuarters = getLastFourQuarters(new Date(), pattern);
  
  res.json({
    earningsCallDate: callDate.toISOString(),
    reportedQuarter,
    reportedYear,
    fiscalYearData,
    offset,
    fiscalYearInfo,
    recentQuarters: recentQuarters.map((q: { year: number; quarter: number }) => ({
      ...q,
      formatted: formatQuarter(q.year, q.quarter, pattern)
    })),
    example: {
      currentQuarter: formatQuarter(recentQuarters[0].year, recentQuarters[0].quarter, pattern),
      previousQuarter: formatQuarter(recentQuarters[1].year, recentQuarters[1].quarter, pattern)
    }
  });
}));

// Basic error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// =============================================================================
// BULK AI PROCESSING ENDPOINTS
// =============================================================================

// Test endpoint for debugging
app.get('/api/ai/test', asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Bulk AI service is working' });
}));

// Start bulk AI processing
app.post('/api/ai/bulk-process', asyncHandler(async (req, res) => {
  const { transcriptIds, tickers, forceRefresh, analystTypes } = req.body;
  
  logger.info('Starting bulk AI processing', {
    transcriptIds: transcriptIds?.length || 0,
    tickers: tickers?.length || 0,
    forceRefresh: forceRefresh || false,
    analystTypes: analystTypes || ['Claude', 'Gemini', 'DeepSeek', 'Grok']
  });

  try {
    const { jobId } = await bulkAIService.processBulkAI({
      transcriptIds,
      tickers,
      forceRefresh,
      analystTypes
    });

    res.json({
      success: true,
      jobId,
      message: 'Bulk AI processing job started'
    });
  } catch (error) {
    logger.error('Failed to start bulk AI processing', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Failed to start bulk AI processing',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Get bulk AI job status
app.get('/api/ai/bulk-process/:jobId', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  
  const job = bulkAIService.getJobStatus(jobId);
  
  if (!job) {
    return res.status(404).json({
      error: 'Job not found'
    });
  }

  res.json({
    success: true,
    job: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      results: job.results,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      estimatedTimeRemaining: job.estimatedTimeRemaining,
      error: job.error
    }
  });
}));

// Get all bulk AI jobs
app.get('/api/ai/bulk-process', asyncHandler(async (req, res) => {
  const jobs = bulkAIService.getAllJobs();
  
  res.json({
    success: true,
    jobs: jobs.map(job => ({
      id: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      estimatedTimeRemaining: job.estimatedTimeRemaining,
      error: job.error
    }))
  });
}));

// Cancel bulk AI job
app.post('/api/ai/bulk-process/:jobId/cancel', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  
  const cancelled = bulkAIService.cancelJob(jobId);
  
  if (!cancelled) {
    return res.status(404).json({
      error: 'Job not found or cannot be cancelled'
    });
  }

  res.json({
    success: true,
    message: 'Job cancelled successfully'
  });
}));

// Get bulk AI processing statistics
app.get('/api/ai/bulk-stats', asyncHandler(async (req, res) => {
  const jobs = bulkAIService.getAllJobs();
  
  const stats = {
    totalJobs: jobs.length,
    activeJobs: jobs.filter(j => j.status === 'running').length,
    pendingJobs: jobs.filter(j => j.status === 'pending').length,
    completedJobs: jobs.filter(j => j.status === 'completed').length,
    failedJobs: jobs.filter(j => j.status === 'failed').length,
    totalTranscriptsProcessed: jobs.reduce((sum, j) => sum + j.progress.processed.length, 0),
    totalSummariesGenerated: jobs.reduce((sum, j) => sum + j.results.reduce((s, r) => s + r.summariesGenerated, 0), 0)
  };

  res.json({
    success: true,
    stats
  });
}));

// Investment Ideas endpoints for Tinder-like interface

// Get all unified investment theses for swiping
app.get('/api/investment-ideas', asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0, excludeBookmarked = false } = req.query;
  
  try {
    logger.info('Fetching investment ideas for swiping interface', {
      limit: Number(limit),
      offset: Number(offset),
      excludeBookmarked
    });

    // Get transcripts that have AI summaries with synthesized thesis
    const transcriptsWithThesis = await prisma.transcript.findMany({
      where: {
        aiSummaries: {
          some: {
            analystType: 'synthesized_thesis'
          }
        },
        // Exclude already bookmarked ideas unless explicitly requested
        ...(excludeBookmarked === 'true' || excludeBookmarked === true ? {
          bookmarkedIdeas: {
            none: {}
          }
        } : {})
      },
      include: {
        aiSummaries: {
          where: {
            analystType: 'synthesized_thesis'
          }
        }
      },
      orderBy: {
        callDate: 'desc'
      },
      skip: Number(offset),
      take: Number(limit)
    });

    // Get bookmark status for each transcript (only if not excluding bookmarked)
    let bookmarkMap = new Map();
    if (excludeBookmarked !== 'true' && excludeBookmarked !== true) {
      const bookmarkedIdeas = await prisma.bookmarkedIdea.findMany({
        where: {
          transcriptId: {
            in: transcriptsWithThesis.map(t => t.id)
          }
        }
      });
      bookmarkMap = new Map(bookmarkedIdeas.map(b => [b.transcriptId, true]));
    }

    const investmentIdeas = transcriptsWithThesis.map(transcript => ({
      id: transcript.id,
      ticker: transcript.ticker,
      companyName: transcript.companyName,
      year: transcript.year,
      quarter: transcript.quarter,
      callDate: transcript.callDate,
      synthesizedThesis: transcript.aiSummaries[0]?.content || null,
      isBookmarked: bookmarkMap.has(transcript.id)
    }));

    res.json({
      success: true,
      ideas: investmentIdeas,
      hasMore: investmentIdeas.length === Number(limit),
      total: investmentIdeas.length
    });

  } catch (error) {
    logger.error('Failed to fetch investment ideas', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Failed to fetch investment ideas',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Bookmark/unbookmark an investment idea
app.post('/api/investment-ideas/:transcriptId/bookmark', asyncHandler(async (req, res) => {
  const { transcriptId } = req.params;
  const { bookmarked } = req.body;
  
  try {
    logger.info('Updating bookmark status', {
      transcriptId,
      bookmarked: Boolean(bookmarked)
    });

    // Get the transcript with its synthesized thesis
    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
      include: {
        aiSummaries: {
          where: { analystType: 'synthesized_thesis' }
        }
      }
    });

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const synthesizedThesis = transcript.aiSummaries[0]?.content;
    if (!synthesizedThesis) {
      return res.status(400).json({ error: 'No synthesized thesis found for this transcript' });
    }

    if (bookmarked) {
      // Create bookmark
      await prisma.bookmarkedIdea.upsert({
        where: {
          ticker_year_quarter: {
            ticker: transcript.ticker,
            year: transcript.year,
            quarter: transcript.quarter
          }
        },
        update: {
          thesis: synthesizedThesis,
          updatedAt: new Date()
        },
        create: {
          ticker: transcript.ticker,
          companyName: transcript.companyName,
          year: transcript.year,
          quarter: transcript.quarter,
          quarterDate: transcript.callDate,
          thesis: synthesizedThesis,
          transcriptId: transcript.id
        }
      });
      
      logger.info('Investment idea bookmarked', {
        ticker: transcript.ticker,
        year: transcript.year,
        quarter: transcript.quarter
      });
    } else {
      // Remove bookmark
      await prisma.bookmarkedIdea.deleteMany({
        where: {
          ticker: transcript.ticker,
          year: transcript.year,
          quarter: transcript.quarter
        }
      });
      
      logger.info('Investment idea bookmark removed', {
        ticker: transcript.ticker,
        year: transcript.year,
        quarter: transcript.quarter
      });
    }
    
    res.json({
      success: true,
      transcriptId,
      bookmarked: Boolean(bookmarked)
    });

  } catch (error) {
    logger.error('Failed to update bookmark', {
      transcriptId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Failed to update bookmark',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Get all bookmarked investment ideas
app.get('/api/bookmarked-ideas', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  
  try {
    logger.info('Fetching bookmarked investment ideas', {
      limit: Number(limit),
      offset: Number(offset),
      sortBy,
      sortOrder
    });

    const bookmarkedIdeas = await prisma.bookmarkedIdea.findMany({
      orderBy: {
        [sortBy as string]: sortOrder
      },
      skip: Number(offset),
      take: Number(limit),
      include: {
        transcript: true
      }
    });

    const totalCount = await prisma.bookmarkedIdea.count();

    const formattedIdeas = bookmarkedIdeas.map(bookmark => ({
      id: bookmark.id,
      ticker: bookmark.ticker,
      companyName: bookmark.companyName,
      year: bookmark.year,
      quarter: bookmark.quarter,
      quarterDate: bookmark.quarterDate,
      thesis: bookmark.thesis,
      transcriptId: bookmark.transcriptId,
      bookmarkedAt: bookmark.createdAt
    }));

    res.json({
      success: true,
      bookmarkedIdeas: formattedIdeas,
      total: totalCount,
      hasMore: bookmarkedIdeas.length === Number(limit)
    });

  } catch (error) {
    logger.error('Failed to fetch bookmarked ideas', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Failed to fetch bookmarked ideas',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

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
  saveSummaryCacheToFile(summaryCache); // Save summary cache
  
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