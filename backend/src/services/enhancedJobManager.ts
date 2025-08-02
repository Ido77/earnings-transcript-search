import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { logger } from '@/config/logger';
import { apiNinjasService } from './apiNinjas';
import { BulkFetchJob, BulkFetchResult, JobProgress } from '@/types';

const JOBS_FILE = path.join(__dirname, '../../cache/jobs.json');
const CHECKPOINT_FILE = path.join(__dirname, '../../cache/checkpoint.json');

export class EnhancedJobManager extends EventEmitter {
  private jobs = new Map<string, BulkFetchJob>();
  private activeJobs = new Set<string>();
  private transcriptCache: Map<string, any>;
  private maxConcurrentJobs = 1;
  private maxConcurrentWorkers = 5; // Parallel workers like Python project
  private batchSize = 20; // Process tickers in batches
  private batchDelay = 5000; // 5 seconds between batches (like Python project)

  constructor(transcriptCache: Map<string, any>) {
    super();
    this.transcriptCache = transcriptCache;
    this.loadJobsFromFile();
    this.resumeIncompleteJobs();
  }

  /**
   * Parse ticker file content and extract tickers
   */
  private parseTickerFile(fileContent: string): string[] {
    // Handle both literal newlines and escaped newlines
    let processedContent = fileContent;
    
    // Replace escaped newlines with actual newlines
    processedContent = processedContent.replace(/\\n/g, '\n');
    
    const lines = processedContent.split('\n').filter(line => line.trim());
    const tickers: string[] = [];
    
    for (const line of lines) {
      try {
        // Try tab-separated first, then space-separated
        let parts = line.split('\t');
        if (parts.length === 1) {
          // If no tabs found, try space-separated
          parts = line.split(/\s+/);
        }
        
        if (parts.length >= 1) {
          const ticker = parts[0].trim().toUpperCase();
          // Only allow alphanumeric characters and dots for ticker symbols
          const cleanTicker = ticker.replace(/[^A-Z0-9.]/g, '');
          if (cleanTicker && cleanTicker.length > 0 && cleanTicker.length <= 10) {
            tickers.push(cleanTicker);
          }
        }
      } catch (error) {
        logger.warn('Failed to parse ticker line', { line, error: error instanceof Error ? error.message : 'Unknown error' });
        continue;
      }
    }
    
    return [...new Set(tickers)]; // Remove duplicates
  }

  /**
   * Get the last N quarters from current date using generalized approach
   * This tries quarters in order of recency, just like the Python project
   */
  private getLastNQuarters(quarterCount: number = 1, ticker?: string): Array<{ year: number; quarter: number }> {
    const { getQuartersToTryForTicker } = require('./quarterCalculator');
    return getQuartersToTryForTicker(ticker || 'GENERAL', quarterCount);
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
   */
  private async fetchTranscriptForTicker(
    ticker: string, 
    quarters: Array<{ year: number; quarter: number }>,
    maxRetries: number = 5
  ): Promise<{ success: boolean; message: string; transcript?: any; quarter?: any }> {
    const startTime = Date.now();
    
    // Try each quarter in order until we find a transcript
    for (const quarter of quarters) {
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
          // Add delay between attempts
          if (attempt > 0) {
            const backoffTime = Math.pow(2, attempt) * 1000; // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }

          const transcript = await apiNinjasService.fetchTranscript(
            ticker,
            quarter.year,
            quarter.quarter
          );

          if (transcript && transcript.transcript) {
            const transcriptData = {
              ticker,
              year: quarter.year,
              quarter: quarter.quarter,
              callDate: transcript.date,
              fullTranscript: transcript.transcript,
              companyName: `${ticker} Inc.`
            };
            
            this.transcriptCache.set(cacheKey, transcriptData);
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
   * Process a batch of tickers in parallel (like Python project)
   */
  private async processBatch(
    tickers: string[], 
    quarters: Array<{ year: number; quarter: number }>,
    jobId: string
  ): Promise<Array<{ ticker: string; success: boolean; message: string; transcript?: any; quarter?: any }>> {
    const results: Array<{ ticker: string; success: boolean; message: string; transcript?: any; quarter?: any }> = [];
    
    // Process tickers in parallel with limited concurrency
    const batchPromises = tickers.map(async (ticker) => {
      const result = await this.fetchTranscriptForTicker(ticker, quarters);
      return { ticker, ...result };
    });
    
    // Use Promise.allSettled to handle failures gracefully
    const settledResults = await Promise.allSettled(batchPromises);
    
    for (let i = 0; i < settledResults.length; i++) {
      const settled = settledResults[i];
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        // Handle rejected promises
        results.push({
          ticker: tickers[i],
          success: false,
          message: `Exception: ${settled.reason?.message || 'Unknown error'}`
        });
      }
    }
    
    return results;
  }

  /**
   * Create a bulk fetch job from file content
   */
  createBulkFetchJobFromFile(fileContent: string, quarterCount: number = 1): string {
    const tickers = this.parseTickerFile(fileContent);
    
    // For now, we'll use the first ticker to determine fiscal year offset
    // In a more sophisticated implementation, we could handle mixed fiscal years
    const firstTicker = tickers.length > 0 ? tickers[0] : undefined;
    const quarters = this.getLastNQuarters(quarterCount, firstTicker);
    
    if (tickers.length === 0) {
      throw new Error('No valid tickers found in file');
    }

    // Add limits to prevent overwhelming the system
    const maxTickers = 1000; // Limit to 1000 tickers per job
    const maxTotalTasks = 10000; // Limit total tasks (tickers * quarters)
    
    if (tickers.length > maxTickers) {
      throw new Error(`Too many tickers: ${tickers.length}. Maximum allowed is ${maxTickers}.`);
    }
    
    const totalTasks = tickers.length * quarters.length;
    if (totalTasks > maxTotalTasks) {
      throw new Error(`Too many total tasks: ${totalTasks} (${tickers.length} tickers × ${quarters.length} quarters). Maximum allowed is ${maxTotalTasks}.`);
    }

    const jobId = uuidv4();
    const job: BulkFetchJob = {
      id: jobId,
      tickers,
      quarters,
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
      quarterCount: quarters.length,
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
      const quarters = job.quarters || [];

      // Load checkpoint for the job
      const { processed, results } = this.loadCheckpoint(jobId);
      const remainingTickers = job.tickers.filter(t => !processed.includes(t));

      if (remainingTickers.length === 0) {
        logger.info(`All tickers for job ${jobId} already processed. Marking as completed.`);
        job.status = 'completed';
        job.completedAt = new Date();
        this.activeJobs.delete(jobId);
        this.saveJobsToFile();
        this.emit('completed', { jobId, job });
        this.processNextJob();
        return;
      }

      // Process remaining tickers in batches
      const batchPromises: Promise<Array<{ ticker: string; success: boolean; message: string; transcript?: any; quarter?: any }>>[] = [];
      for (let i = 0; i < remainingTickers.length; i += this.batchSize) {
        const batchTickers = remainingTickers.slice(i, i + this.batchSize);
        batchPromises.push(this.processBatch(batchTickers, quarters, jobId));
      }

      const allBatchResults = await Promise.all(batchPromises);
      const allResults = allBatchResults.flat();

      // Save checkpoint after each batch
      this.saveCheckpoint(jobId, processed.concat(allResults.filter(r => r.success).map(r => r.ticker)), allResults);

      // Update job progress and results
      job.progress.processed = processed.concat(allResults.filter(r => r.success).map(r => r.ticker));
      job.progress.failed = allResults.filter(r => !r.success).map(r => r.ticker);
      job.progress.skipped = allResults.filter(r => r.message.includes('Found in cache')).map(r => r.ticker);
      job.progress.current = processed.length + allResults.filter(r => r.success).length;
      job.progress.total = totalTickers;
      job.results = allResults.map(result => ({
        ticker: result.ticker,
        status: result.success ? 'success' : 'failed',
        message: result.message,
        year: result.quarter?.year,
        quarter: result.quarter?.quarter,
        transcriptLength: result.transcript?.fullTranscript?.length || 0
      }));
      
      this.saveJobsToFile();
      this.emit('progress', { jobId, job });

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