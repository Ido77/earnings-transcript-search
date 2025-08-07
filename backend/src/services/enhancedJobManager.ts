import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { logger } from '@/config/logger';
import { prisma } from '@/config/database';
import { apiNinjasService } from './apiNinjas';
import { BulkFetchJob, BulkFetchResult, JobProgress } from '@/types';

const JOBS_FILE = path.join(__dirname, '../../cache/jobs.json');
const CHECKPOINT_FILE = path.join(__dirname, '../../cache/checkpoint.json');

export class EnhancedJobManager extends EventEmitter {
  private jobs = new Map<string, BulkFetchJob>();
  private activeJobs = new Set<string>();
  private transcriptCache: Map<string, any>;
  private maxConcurrentJobs = 1;
  private maxConcurrentWorkers = 3; // Reduced from 5 to avoid rate limiting
  private batchSize = 5; // Reduced from 20 to smaller batches
  private batchDelay = 10000; // Increased to 10 seconds between batches

  constructor(transcriptCache: Map<string, any>) {
    super();
    this.transcriptCache = transcriptCache;
    this.loadJobsFromFile();
    this.resumeIncompleteJobs();
  }

  /**
   * Parse ticker file content and extract ticker symbols
   */
  private parseTickerFile(fileContent: string): string[] {
    const lines = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const tickers: string[] = [];
    
    for (const line of lines) {
      // Handle different formats: "TICKER", "TICKER\tCompany Name", "TICKER Company Name"
      const parts = line.split(/[\t\s]+/);
      const ticker = parts[0]?.toUpperCase().trim();
      
      if (ticker && ticker.length > 0 && ticker.length <= 10) {
        tickers.push(ticker);
      } else {
        logger.warn('Skipping invalid ticker format', { line, ticker });
        continue;
      }
    }
    
    return [...new Set(tickers)]; // Remove duplicates
  }

  /**
   * Load checkpoint from file (like Python project)
   */
  private loadCheckpoint(jobId: string): { processed: string[], results: any[] } {
    const checkpointFile = path.join(__dirname, `../../cache/checkpoint_${jobId}.json`);
    if (fs.existsSync(checkpointFile)) {
      try {
        const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
        logger.info(`Loaded checkpoint for job ${jobId} with ${checkpoint.processed.length} processed tickers`);
        return checkpoint;
      } catch (error) {
        logger.error(`Error loading checkpoint for job ${jobId}:`, error);
      }
    }
    return { processed: [], results: [] };
  }

  /**
   * Save checkpoint to file (like Python project)
   */
  private saveCheckpoint(jobId: string, processed: string[], results: any[]): void {
    const checkpointFile = path.join(__dirname, `../../cache/checkpoint_${jobId}.json`);
    try {
      const checkpoint = {
        processed,
        results,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
      logger.debug(`Saved checkpoint for job ${jobId} with ${processed.length} processed tickers`);
    } catch (error) {
      logger.error(`Error saving checkpoint for job ${jobId}:`, error);
    }
  }

  /**
   * Fetch transcript for a single ticker with retry logic (like Python project)
   * OPTIMIZED: Gets quarters one at a time and stops at first non-null result
   */
  private async fetchTranscriptForTicker(
    ticker: string, 
    maxQuartersToTry: number = 16,
    maxRetries: number = 5
  ): Promise<{ success: boolean; message: string; transcript?: any; quarter?: any }> {
    const startTime = Date.now();
    const { getQuarterAtIndex } = require('./quarterCalculator');
    
    // Try quarters one at a time until we find a transcript or run out of quarters
    for (let quarterIndex = 0; quarterIndex < maxQuartersToTry; quarterIndex++) {
      const quarter = getQuarterAtIndex(quarterIndex);
      if (!quarter) {
        break; // No more quarters available
      }
      
      const cacheKey = `${ticker}-${quarter.year}-Q${quarter.quarter}`;
      
      // Check if already in cache
      if (this.transcriptCache.has(cacheKey)) {
        const elapsedTime = (Date.now() - startTime) / 1000;
        return {
          success: true,
          message: `Found in cache (took ${elapsedTime.toFixed(2)}s)`,
          transcript: this.transcriptCache.get(cacheKey),
          quarter
        };
      }

      // Retry logic with exponential backoff (like Python project)
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Add delay between attempts and between API calls
          if (attempt > 0) {
            const backoffTime = Math.pow(2, attempt) * 1000; // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          } else {
            // Add delay between API calls to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          }

          const transcript = await apiNinjasService.fetchTranscript(
            ticker,
            quarter.year,
            quarter.quarter
          );

          if (transcript && transcript.transcript) {
            // Parse transcript date
            let callDate: Date | null = null;
            if (transcript.date) {
              try {
                callDate = new Date(transcript.date);
              } catch (error) {
                logger.warn('Invalid date format in transcript', {
                  ticker,
                  year: quarter.year,
                  quarter: quarter.quarter,
                  date: transcript.date,
                });
              }
            }

            const transcriptData = {
              ticker,
              year: quarter.year,
              quarter: quarter.quarter,
              callDate: transcript.date,
              fullTranscript: transcript.transcript,
              companyName: `${ticker} Inc.`
            };
            
            // Store in cache
            this.transcriptCache.set(cacheKey, transcriptData);

            // Also save to database
            try {
              const savedTranscript = await prisma.transcript.upsert({
                where: {
                  ticker_year_quarter: {
                    ticker: ticker.toUpperCase(),
                    year: quarter.year,
                    quarter: quarter.quarter,
                  },
                },
                update: {
                  fullTranscript: transcript.transcript,
                  callDate,
                  updatedAt: new Date(),
                },
                create: {
                  ticker: ticker.toUpperCase(),
                  year: quarter.year,
                  quarter: quarter.quarter,
                  fullTranscript: transcript.transcript,
                  callDate,
                  transcriptJson: {},
                },
              });

              logger.info('Transcript saved to database from enhanced job manager', {
                ticker,
                year: quarter.year,
                quarter: quarter.quarter,
                transcriptId: savedTranscript.id
              });
            } catch (dbError) {
              logger.error('Failed to save transcript to database', {
                ticker,
                year: quarter.year,
                quarter: quarter.quarter,
                error: dbError instanceof Error ? dbError.message : 'Unknown error'
              });
            }
            
            const elapsedTime = (Date.now() - startTime) / 1000;
            
            return {
              success: true,
              message: `Successfully fetched ${quarter.year}Q${quarter.quarter} (took ${elapsedTime.toFixed(2)}s)`,
              transcript: transcriptData,
              quarter
            };
          }
          
          // No transcript for this quarter, try next quarter
          break;
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          // Handle rate limiting specifically
          if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            logger.warn(`Rate limit for ${ticker} ${quarter.year}Q${quarter.quarter}, attempt ${attempt + 1}/${maxRetries}`);
            if (attempt < maxRetries - 1) {
              continue; // Retry with backoff
            }
          }
          
          logger.debug(`Failed to fetch ${ticker} ${quarter.year}Q${quarter.quarter}, attempt ${attempt + 1}/${maxRetries}:`, errorMessage);
          
          if (attempt === maxRetries - 1) {
            // Last attempt failed, try next quarter
            break;
          }
        }
      }
    }
    
    const elapsedTime = (Date.now() - startTime) / 1000;
    return {
      success: false,
      message: `No transcript found for any quarter (took ${elapsedTime.toFixed(2)}s)`
    };
  }

  /**
   * Process a batch of tickers sequentially to avoid rate limiting
   */
  private async processBatch(
    tickers: string[], 
    maxQuartersToTry: number = 16,
    jobId: string
  ): Promise<Array<{ ticker: string; success: boolean; message: string; transcript?: any; quarter?: any }>> {
    const results: Array<{ ticker: string; success: boolean; message: string; transcript?: any; quarter?: any }> = [];
    
    // Process tickers sequentially to avoid rate limiting
    for (const ticker of tickers) {
      const result = await this.fetchTranscriptForTicker(ticker, maxQuartersToTry);
      results.push({ ticker, ...result });
      
      // Add delay between tickers in the same batch
      if (ticker !== tickers[tickers.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay between tickers
      }
    }
    
    return results;
  }

  /**
   * Create a bulk fetch job from file content
   * OPTIMIZED: No longer stores all quarters in job, just uses quarterCount
   */
  createBulkFetchJobFromFile(fileContent: string, quarterCount: number = 16): string {
    const tickers = this.parseTickerFile(fileContent);
    
    if (tickers.length === 0) {
      throw new Error('No valid tickers found in file');
    }

    // Add limits to prevent overwhelming the system
    const maxTickers = 1000; // Limit to 1000 tickers per job
    const maxTotalTasks = 10000; // Limit total tasks (tickers * quarters)
    
    if (tickers.length > maxTickers) {
      throw new Error(`Too many tickers: ${tickers.length}. Maximum allowed is ${maxTickers}.`);
    }
    
    const totalTasks = tickers.length * quarterCount;
    if (totalTasks > maxTotalTasks) {
      throw new Error(`Too many total tasks: ${totalTasks} (${tickers.length} tickers × ${quarterCount} quarters). Maximum allowed is ${maxTotalTasks}.`);
    }

    const jobId = uuidv4();
    const job: BulkFetchJob = {
      id: jobId,
      tickers,
      quarters: [], // No longer needed, but keeping for backward compatibility
      status: 'pending',
      createdAt: new Date(),
      progress: {
        current: 0,
        total: tickers.length,
        currentTicker: '',
        processed: [],
        failed: [],
        skipped: []
      },
      results: []
    };

    this.jobs.set(jobId, job);
    this.saveJobsToFile();
    
    logger.info('Created bulk fetch job', {
      jobId,
      tickerCount: tickers.length,
      quarterCount: quarterCount,
      totalTasks
    });

    // Start processing if no other jobs are running
    if (this.activeJobs.size === 0) {
      this.processNextJob();
    }

    return jobId;
  }

  /**
   * Process the next job in the queue
   */
  private async processNextJob() {
    if (this.activeJobs.size >= this.maxConcurrentJobs) {
      return;
    }

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'pending' && !this.activeJobs.has(jobId)) {
        this.activeJobs.add(jobId);
        this.processJob(jobId, job);
        break;
      }
    }
  }

  /**
   * Process a specific job
   */
  private async processJob(jobId: string, job: BulkFetchJob) {
    try {
      job.status = 'running';
      job.startedAt = new Date();
      this.saveJobsToFile();
      
      this.emit('progress', { jobId, job });

      const totalTickers = job.tickers.length;
      const quarterCount = job.quarters?.length || 16; // Default to 16 if no quarters specified

      // Process all tickers (simplified without checkpoint for now)
      const remainingTickers = job.tickers;

      // Process remaining tickers in batches sequentially (like Python project)
      const allResults: Array<{ ticker: string; success: boolean; message: string; transcript?: any; quarter?: any }> = [];
      
      for (let i = 0; i < remainingTickers.length; i += this.batchSize) {
        const batchTickers = remainingTickers.slice(i, i + this.batchSize);
        const batchNum = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(remainingTickers.length / this.batchSize);
        
        logger.info(`Processing batch ${batchNum}/${totalBatches} (${batchTickers.length} tickers)`, { jobId });
        
        const batchResults = await this.processBatch(batchTickers, quarterCount, jobId);
        allResults.push(...batchResults);
        
        // Update progress after each batch
        const currentProcessed = allResults.filter(r => r.success).map(r => r.ticker);
        job.progress.processed = currentProcessed;
        job.progress.failed = allResults.filter(r => !r.success).map(r => r.ticker);
        job.progress.skipped = allResults.filter(r => r.message.includes('Found in cache')).map(r => r.ticker);
        job.progress.current = currentProcessed.length;
        job.progress.total = totalTickers;
        
        this.saveJobsToFile();
        this.emit('progress', { jobId, job });
        
        // Add delay between batches (except for the last batch)
        if (i + this.batchSize < remainingTickers.length) {
          logger.info(`Waiting ${this.batchDelay}ms before next batch...`, { jobId });
          await new Promise(resolve => setTimeout(resolve, this.batchDelay));
        }
      }

      // Update final job results
      job.results = allResults.map(result => ({
        ticker: result.ticker,
        status: result.success ? 'success' : 'failed',
        message: result.message,
        year: result.quarter?.year,
        quarter: result.quarter?.quarter,
        transcriptLength: result.transcript?.fullTranscript?.length || 0
      }));

      // Mark job as completed
      job.status = 'completed';
      job.completedAt = new Date();
      this.activeJobs.delete(jobId);
      this.saveJobsToFile();
      
      this.emit('completed', { jobId, job });
      
      // Process next job
      this.processNextJob();

    } catch (error) {
      logger.error('Job processing failed', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date();
      this.activeJobs.delete(jobId);
      this.saveJobsToFile();
      
      this.emit('failed', { jobId, job, error });
      this.processNextJob();
    }
  }

  /**
   * Pause a job
   */
  pauseJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'running') {
      job.status = 'paused';
      this.saveJobsToFile();
      this.emit('paused', { jobId, job });
      return true;
    }
    return false;
  }

  /**
   * Resume a job
   */
  resumeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'paused') {
      job.status = 'running';
      this.saveJobsToFile();
      this.emit('resumed', { jobId, job });
      return true;
    }
    return false;
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job && (job.status === 'pending' || job.status === 'running' || job.status === 'paused')) {
      job.status = 'cancelled';
      this.activeJobs.delete(jobId);
      this.saveJobsToFile();
      this.emit('cancelled', { jobId, job });
      return true;
    }
    return false;
  }

  /**
   * Get job progress
   */
  getJobProgress(jobId: string): JobProgress | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      lastUpdate: new Date()
    };
  }

  /**
   * Get all jobs
   */
  getAllJobs(): BulkFetchJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Load jobs from file
   */
  private loadJobsFromFile(): void {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
        this.jobs = new Map(Object.entries(data));
      }
    } catch (error) {
      logger.error('Failed to load jobs from file', { error });
    }
  }

  /**
   * Save jobs to file
   */
  private saveJobsToFile(): void {
    try {
      const data = Object.fromEntries(this.jobs);
      fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save jobs to file', { error });
    }
  }

  /**
   * Resume incomplete jobs on startup
   */
  private resumeIncompleteJobs(): void {
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'running' || job.status === 'paused') {
        job.status = 'pending'; // Reset to pending so it can be processed
        this.saveJobsToFile();
      }
    }
  }
} 