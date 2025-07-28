import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { logger } from '@/config/logger';
import { apiNinjasService } from './apiNinjas';
import { BulkFetchJob, BulkFetchResult, JobProgress } from '@/types';

const JOBS_FILE = path.join(__dirname, '../../cache/jobs.json');

export class JobManager extends EventEmitter {
  private jobs = new Map<string, BulkFetchJob>();
  private activeJobs = new Set<string>();
  private transcriptCache: Map<string, any>;

  constructor(transcriptCache: Map<string, any>) {
    super();
    this.transcriptCache = transcriptCache;
    this.loadJobsFromFile();
    this.resumeIncompleteJobs();
  }

  /**
   * Create a new bulk fetch job
   */
  createBulkFetchJob(tickers: string[]): string {
    const jobId = uuidv4();
    const job: BulkFetchJob = {
      id: jobId,
      status: 'pending',
      tickers: tickers.map(t => t.toLowerCase()),
      progress: {
        current: 0,
        total: tickers.length,
        processed: [],
        failed: [],
        skipped: []
      },
      results: [],
      createdAt: new Date()
    };

    this.jobs.set(jobId, job);
    this.saveJobsToFile();

    logger.info('Background job created', {
      jobId,
      tickerCount: tickers.length,
      status: job.status
    });

    // Start processing immediately (non-blocking)
    setImmediate(() => this.processJob(jobId));

    return jobId;
  }

  /**
   * Get job status and progress
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
   * Get all jobs (for admin/monitoring)
   */
  getAllJobs(): BulkFetchJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Process a job in the background
   */
  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'pending') return;

    if (this.activeJobs.has(jobId)) {
      logger.warn('Job already processing', { jobId });
      return;
    }

    this.activeJobs.add(jobId);
    job.status = 'running';
    job.startedAt = new Date();
    this.saveJobsToFile();

    logger.info('Background job started', {
      jobId,
      tickerCount: job.tickers.length,
      resumeFrom: job.progress.current
    });

    try {
      // Define quarters to try (latest first)
      const quartersToTry = [
        { year: 2025, quarter: 4 }, { year: 2025, quarter: 3 }, { year: 2025, quarter: 2 }, { year: 2025, quarter: 1 },
        { year: 2024, quarter: 4 }, { year: 2024, quarter: 3 }, { year: 2024, quarter: 2 }, { year: 2024, quarter: 1 },
        { year: 2023, quarter: 4 }, { year: 2023, quarter: 3 }, { year: 2023, quarter: 2 }, { year: 2023, quarter: 1 },
        { year: 2022, quarter: 4 }, { year: 2022, quarter: 3 }, { year: 2022, quarter: 2 }, { year: 2022, quarter: 1 }
      ];

      // Resume from where we left off
      for (let i = job.progress.current; i < job.tickers.length; i++) {
        const ticker = job.tickers[i];
        job.progress.current = i + 1;
        job.progress.currentTicker = ticker;

        logger.info('Processing ticker in background', {
          jobId,
          ticker,
          progress: `${i + 1}/${job.tickers.length}`
        });

        try {
          const fetchedTranscripts = [];

          // Try quarters one by one until we get 4 successful transcripts
          for (const quarter of quartersToTry) {
            if (fetchedTranscripts.length >= 4) break;

            const cacheKey = `${ticker.toLowerCase()}-${quarter.year}-Q${quarter.quarter}`;
            
            // Check if already cached
            if (this.transcriptCache.has(cacheKey)) {
              const cachedTranscript = this.transcriptCache.get(cacheKey);
              job.progress.skipped.push(ticker);
              job.results.push({
                ticker: ticker.toUpperCase(),
                year: quarter.year,
                quarter: quarter.quarter,
                status: 'success',
                transcriptLength: cachedTranscript.fullTranscript.length,
                transcriptId: cacheKey,
                storage: 'cached',
                skipped: true,
              });
              fetchedTranscripts.push({ ticker, year: quarter.year, quarter: quarter.quarter });
              continue;
            }

            try {
              const transcript = await apiNinjasService.fetchTranscript(ticker, quarter.year, quarter.quarter);
              
              if (transcript) {
                fetchedTranscripts.push(transcript);

                // Store in cache
                this.transcriptCache.set(cacheKey, {
                  id: cacheKey,
                  ticker: transcript.ticker.toLowerCase(),
                  companyName: transcript.ticker, // Use ticker as company name fallback
                  year: transcript.year,
                  quarter: transcript.quarter,
                  callDate: transcript.date || new Date().toISOString(),
                  fullTranscript: transcript.transcript,
                  transcriptJson: transcript,
                });

                job.results.push({
                  ticker: transcript.ticker,
                  year: transcript.year,
                  quarter: transcript.quarter,
                  status: 'success',
                  transcriptLength: transcript.transcript.length,
                  transcriptId: cacheKey,
                  storage: 'memory',
                });

                logger.info('Transcript fetched in background', {
                  jobId,
                  ticker,
                  year: transcript.year,
                  quarter: transcript.quarter,
                  length: transcript.transcript.length
                });
              }
            } catch (error) {
              logger.debug('Quarter fetch failed in background job', {
                jobId,
                ticker,
                year: quarter.year,
                quarter: quarter.quarter,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }

            // Small delay to prevent API overload
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          if (fetchedTranscripts.length === 0) {
            job.progress.failed.push(ticker);
            job.results.push({
              ticker: ticker.toUpperCase(),
              status: 'not_available',
              error: 'No transcript data available for any recent quarters',
            });
          } else {
            job.progress.processed.push(ticker);
          }

        } catch (error) {
          job.progress.failed.push(ticker);
          job.results.push({
            ticker: ticker.toUpperCase(),
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          logger.error('Error processing ticker in background job', {
            jobId,
            ticker,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Save progress periodically
        this.saveJobsToFile();
        this.emit('progress', { jobId, job });

        // Check if job was cancelled
        const currentJob = this.jobs.get(jobId);
        if (!currentJob || currentJob.status === 'paused') {
          logger.info('Background job paused', { jobId });
          return;
        }
      }

      // Job completed
      job.status = 'completed';
      job.completedAt = new Date();
      job.progress.currentTicker = undefined;

      logger.info('Background job completed', {
        jobId,
        processed: job.progress.processed.length,
        failed: job.progress.failed.length,
        skipped: job.progress.skipped.length,
        total: job.tickers.length
      });

      this.emit('completed', { jobId, job });

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Background job failed', {
        jobId,
        error: job.error
      });
      this.emit('failed', { jobId, job, error });
    } finally {
      this.activeJobs.delete(jobId);
      this.saveJobsToFile();
    }
  }

  /**
   * Pause a running job
   */
  pauseJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return false;

    job.status = 'paused';
    this.saveJobsToFile();
    logger.info('Background job paused', { jobId });
    return true;
  }

  /**
   * Resume a paused job
   */
  resumeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'paused') return false;

    job.status = 'pending';
    this.saveJobsToFile();
    setImmediate(() => this.processJob(jobId));
    return true;
  }

  /**
   * Load jobs from file on startup
   */
  private loadJobsFromFile(): void {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const data = fs.readFileSync(JOBS_FILE, 'utf8');
        const jobsData = JSON.parse(data);
        
        Object.entries(jobsData).forEach(([jobId, jobData]: [string, any]) => {
          // Convert date strings back to Date objects
          jobData.createdAt = new Date(jobData.createdAt);
          if (jobData.startedAt) jobData.startedAt = new Date(jobData.startedAt);
          if (jobData.completedAt) jobData.completedAt = new Date(jobData.completedAt);
          
          this.jobs.set(jobId, jobData as BulkFetchJob);
        });

        logger.info('Jobs loaded from file', { 
          count: this.jobs.size,
          file: JOBS_FILE 
        });
      }
    } catch (error) {
      logger.error('Failed to load jobs from file', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        file: JOBS_FILE 
      });
    }
  }

  /**
   * Save jobs to file
   */
  private saveJobsToFile(): void {
    try {
      const jobsData = Object.fromEntries(this.jobs.entries());
      fs.writeFileSync(JOBS_FILE, JSON.stringify(jobsData, null, 2));
    } catch (error) {
      logger.error('Failed to save jobs to file', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        file: JOBS_FILE 
      });
    }
  }

  /**
   * Resume incomplete jobs on startup
   */
  private resumeIncompleteJobs(): void {
    const incompleteJobs = Array.from(this.jobs.values()).filter(
      job => job.status === 'running' || job.status === 'pending'
    );

    if (incompleteJobs.length > 0) {
      logger.info('Resuming incomplete jobs', { 
        count: incompleteJobs.length,
        jobs: incompleteJobs.map(j => ({ id: j.id, status: j.status, progress: `${j.progress.current}/${j.progress.total}` }))
      });

      incompleteJobs.forEach(job => {
        job.status = 'pending'; // Reset running jobs to pending
        setImmediate(() => this.processJob(job.id));
      });
    }
  }
} 