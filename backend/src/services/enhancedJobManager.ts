import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { logger } from '@/config/logger';
import { apiNinjasService } from './apiNinjas';
import { BulkFetchJob, BulkFetchResult, JobProgress } from '@/types';

const JOBS_FILE = path.join(__dirname, '../../cache/jobs.json');

export class EnhancedJobManager extends EventEmitter {
  private jobs = new Map<string, BulkFetchJob>();
  private activeJobs = new Set<string>();
  private transcriptCache: Map<string, any>;
  private maxConcurrentJobs = 1;
  private maxConcurrentRequests = 3; // Reduced from 10 to avoid rate limiting

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
   * Get the last N quarters from current date, starting from 2 quarters ago
   * This ensures we fetch quarters that are more likely to have transcripts available
   * Most companies release earnings 1-2 months after quarter end, so we start from 2 quarters ago
   */
  private getLastNQuarters(quarterCount: number = 1): Array<{ year: number; quarter: number }> {
    const quarters: Array<{ year: number; quarter: number }> = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // Calculate current quarter (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec)
    const currentQuarter = Math.floor(currentMonth / 3) + 1;
    
    // Start from 2 quarters ago to ensure we fetch available transcripts
    // Most companies haven't released Q2 2025 yet (we're in Q3 2025)
    // Start from Q1 2025 and go backwards
    for (let i = 2; i <= quarterCount + 1; i++) {
      const quarterOffset = i;
      const year = currentYear - Math.floor(quarterOffset / 4);
      const quarter = currentQuarter - (quarterOffset % 4);
      
      if (quarter <= 0) {
        quarters.push({ year: year - 1, quarter: quarter + 4 });
      } else {
        quarters.push({ year, quarter });
      }
    }
    
    return quarters;
  }

  /**
   * Create a bulk fetch job from file content
   */
  createBulkFetchJobFromFile(fileContent: string, quarterCount: number = 1): string {
    const tickers = this.parseTickerFile(fileContent);
    const quarters = this.getLastNQuarters(quarterCount);
    
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
      progress: {
        current: 0,
        total: tickers.length * quarters.length,
        processed: [],
        failed: [],
        skipped: [],
        currentTicker: ''
      },
      results: [],
      createdAt: new Date()
    };

    this.jobs.set(jobId, job);
    this.saveJobsToFile();
    
    // Start processing if no other jobs are running
    this.processNextJob();
    
    logger.info('Created bulk fetch job from file', {
      jobId,
      tickerCount: tickers.length,
      quarterCount: quarters.length,
      totalTasks: job.progress.total
    });

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

      for (let tickerIndex = job.progress.current; tickerIndex < totalTickers; tickerIndex++) {
        // Check if job was cancelled
        const currentJob = this.jobs.get(jobId);
        if (!currentJob || currentJob.status === 'cancelled') {
          break;
        }

        // Check if job was paused
        if (currentJob.status === 'paused') {
          // Wait until resumed
          while (currentJob.status === 'paused') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const updatedJob = this.jobs.get(jobId);
            if (!updatedJob || updatedJob.status === 'cancelled') {
              return;
            }
          }
        }

        const ticker = job.tickers[tickerIndex];
        job.progress.currentTicker = ticker;

        // Process quarters for this ticker sequentially, starting from most recent
        // Stop when we find a transcript to avoid unnecessary API calls
        let foundTranscript = false;
        for (const quarter of quarters) {
          const currentJobState = this.jobs.get(jobId);
          if (!currentJobState || currentJobState.status === 'cancelled') {
            break;
          }

          const cacheKey = `${ticker}-${quarter.year}-Q${quarter.quarter}`;
          
          // Check if already in cache
          if (this.transcriptCache.has(cacheKey)) {
            job.progress.skipped.push(ticker); // Store ticker name instead of cache key
            foundTranscript = true;
            break; // Found a transcript, no need to try other quarters
          }

          try {
            // Add a small delay between API calls to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const transcript = await apiNinjasService.fetchTranscript(
              ticker,
              quarter.year,
              quarter.quarter
            );

            if (transcript && transcript.transcript) {
              this.transcriptCache.set(cacheKey, {
                ticker,
                year: quarter.year,
                quarter: quarter.quarter,
                callDate: transcript.date,
                fullTranscript: transcript.transcript,
                companyName: `${ticker} Inc.`
              });
              
              job.progress.processed.push(ticker); // Store ticker name instead of cache key
              foundTranscript = true;
              logger.info('Successfully fetched transcript', {
                ticker,
                year: quarter.year,
                quarter: quarter.quarter
              });
              break; // Found a transcript, no need to try other quarters
            } else {
              // No transcript for this quarter, continue to next quarter
              logger.debug('No transcript found for quarter', {
                ticker,
                year: quarter.year,
                quarter: quarter.quarter
              });
            }
          } catch (error) {
            logger.error('Failed to fetch transcript', {
              ticker,
              year: quarter.year,
              quarter: quarter.quarter,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            // Add retry logic for transient errors
            if (error instanceof Error && error.message.includes('rate limit')) {
              logger.info('Rate limit detected, waiting longer before retry', { ticker });
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            // Continue to next quarter on error
          }
        }

        // If no transcript found for any quarter, try a retry with longer delays
        if (!foundTranscript) {
          logger.warn('No transcript found for any quarter, attempting retry with longer delays', { ticker });
          
          // Retry with longer delays for potentially rate-limited requests
          let retryFoundTranscript = false;
          for (const quarter of quarters) {
            const currentJobState = this.jobs.get(jobId);
            if (!currentJobState || currentJobState.status === 'cancelled') {
              break;
            }

            const cacheKey = `${ticker}-${quarter.year}-Q${quarter.quarter}`;
            
            // Check if already in cache (might have been added by another process)
            if (this.transcriptCache.has(cacheKey)) {
              job.progress.skipped.push(ticker);
              retryFoundTranscript = true;
              logger.info('Found transcript in cache during retry', { ticker, quarter: `${quarter.year}-Q${quarter.quarter}` });
              break;
            }

            try {
              // Longer delay for retry attempts
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              const transcript = await apiNinjasService.fetchTranscript(
                ticker,
                quarter.year,
                quarter.quarter
              );

              if (transcript && transcript.transcript) {
                this.transcriptCache.set(cacheKey, {
                  ticker,
                  year: quarter.year,
                  quarter: quarter.quarter,
                  callDate: transcript.date,
                  fullTranscript: transcript.transcript,
                  companyName: `${ticker} Inc.`
                });
                
                job.progress.processed.push(ticker);
                retryFoundTranscript = true;
                logger.info('Successfully fetched transcript on retry', {
                  ticker,
                  year: quarter.year,
                  quarter: quarter.quarter
                });
                break;
              }
            } catch (error) {
              logger.debug('Retry attempt failed', {
                ticker,
                year: quarter.year,
                quarter: quarter.quarter,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
          
          // If still no transcript found after retry, mark as failed
          if (!retryFoundTranscript) {
            job.progress.failed.push(ticker);
            logger.warn('No transcript found for any quarter after retry', { ticker });
          }
        }
        
        job.progress.current = tickerIndex + 1;
        this.saveJobsToFile();
        this.emit('progress', { jobId, job });
        
        // Add a delay between processing different tickers to avoid overwhelming the API
        if (tickerIndex < totalTickers - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

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