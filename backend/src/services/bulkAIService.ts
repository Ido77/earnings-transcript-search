import { EventEmitter } from 'events';
import { logger } from '../config/logger';
import { prisma } from '../config/database';
import { GoogleAIService } from './googleAIService';
import { BulkAIProcessingRequest, BulkAIProcessingResponse, BulkAIProcessingResult } from '../types';

interface BulkAIJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  transcriptIds: string[];
  analystTypes: string[];
  forceRefresh: boolean;
  progress: {
    current: number;
    total: number;
    currentTranscript?: string;
    processed: string[];
    failed: string[];
    skipped: string[];
  };
  results: BulkAIProcessingResult[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  estimatedTimeRemaining?: number;
}

export class BulkAIService extends EventEmitter {
  private jobs = new Map<string, BulkAIJob>();
  private googleAIService: GoogleAIService;
  private isProcessing = false;
  private currentJobId?: string;
  private transcriptCache: Map<string, any>;

  constructor(transcriptCache: Map<string, any>) {
    super();
    this.googleAIService = new GoogleAIService();
    this.transcriptCache = transcriptCache;
  }

  /**
   * Start bulk AI processing for multiple transcripts
   */
  async processBulkAI(request: BulkAIProcessingRequest): Promise<{ jobId: string }> {
    const jobId = `bulk-ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Get transcript IDs to process
    let transcriptIds: string[] = [];
    
    if (request.processAllTranscripts) {
      // Process ALL transcripts in the database
      const allTranscripts = await prisma.transcript.findMany({
        select: { id: true, ticker: true, year: true, quarter: true },
        orderBy: [
          { ticker: 'asc' },
          { year: 'desc' },
          { quarter: 'desc' }
        ]
      });
      
      transcriptIds = allTranscripts.map(t => t.id);
      
      logger.info('Processing ALL transcripts from database', {
        jobId,
        totalTranscripts: transcriptIds.length,
        analystTypes: request.analystTypes
      });
      
    } else if (request.transcriptIds && request.transcriptIds.length > 0) {
      transcriptIds = request.transcriptIds;
    } else if (request.tickers && request.tickers.length > 0) {
      // Get transcript IDs from tickers - check database first, then cache
      const transcripts = await prisma.transcript.findMany({
        where: {
          ticker: { in: request.tickers }
        },
        select: { id: true, ticker: true, year: true, quarter: true }
      });
      
      transcriptIds = transcripts.map(t => t.id);
      const foundTickers = new Set(transcripts.map(t => t.ticker));
      const missingTickers = request.tickers.filter(ticker => !foundTickers.has(ticker));
      
      // Check cache for missing tickers and save them to database
      if (missingTickers.length > 0) {
        logger.info('Checking cache for missing tickers', {
          jobId,
          missingTickers,
          cacheSize: this.transcriptCache.size
        });
        
        const cacheTranscriptsToSave: any[] = [];
        
        for (const [cacheKey, transcript] of this.transcriptCache.entries()) {
          if (missingTickers.includes(transcript.ticker)) {
            cacheTranscriptsToSave.push(transcript);
          }
        }
        
        // Save cache transcripts to database
        for (const transcript of cacheTranscriptsToSave) {
          try {
            await prisma.transcript.create({
              data: {
                id: transcript.id,
                ticker: transcript.ticker,
                companyName: transcript.ticker, // Use ticker as fallback
                year: transcript.year,
                quarter: transcript.quarter,
                callDate: transcript.callDate,
                fullTranscript: transcript.fullTranscript,
                transcriptJson: transcript.transcriptJson,
                transcriptSplit: undefined
              }
            });
            
            transcriptIds.push(transcript.id);
            
            logger.info('Saved transcript from cache to database', {
              jobId,
              transcriptId: transcript.id,
              ticker: transcript.ticker
            });
          } catch (error) {
            logger.error('Failed to save transcript from cache to database', {
              jobId,
              transcriptId: transcript.id,
              ticker: transcript.ticker,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
      
      logger.info('Found transcripts for tickers', {
        jobId,
        tickers: request.tickers,
        fromDatabase: transcripts.length,
        fromCache: transcriptIds.length - transcripts.length,
        totalTranscriptIds: transcriptIds.length
      });
    } else {
      // Process all transcripts in database
      const transcripts = await prisma.transcript.findMany({
        select: { id: true, ticker: true, year: true, quarter: true }
      });
      
      transcriptIds = transcripts.map(t => t.id);
      
      logger.info('Processing all transcripts in database', {
        jobId,
        transcriptCount: transcriptIds.length
      });
    }

    if (transcriptIds.length === 0) {
      throw new Error('No transcripts found to process');
    }

    // Filter out transcripts that already have AI summaries (unless force refresh)
    let transcriptsToProcess = transcriptIds;
    if (!request.forceRefresh) {
      const existingSummaries = await prisma.aISummary.findMany({
        where: {
          transcriptId: { in: transcriptIds }
        },
        select: { transcriptId: true },
        distinct: ['transcriptId']
      });
      
      const transcriptsWithSummaries = new Set(existingSummaries.map(s => s.transcriptId));
      transcriptsToProcess = transcriptIds.filter(id => !transcriptsWithSummaries.has(id));
      
      logger.info('Filtered transcripts that already have AI summaries', {
        jobId,
        total: transcriptIds.length,
        toProcess: transcriptsToProcess.length,
        skipped: transcriptIds.length - transcriptsToProcess.length
      });
    }

    // Create job
    const job: BulkAIJob = {
      id: jobId,
      status: 'pending',
      transcriptIds: transcriptsToProcess,
      analystTypes: request.analystTypes || ['Claude', 'Gemini', 'DeepSeek', 'Grok'],
      forceRefresh: request.forceRefresh || false,
      progress: {
        current: 0,
        total: transcriptsToProcess.length,
        processed: [],
        failed: [],
        skipped: request.forceRefresh ? [] : transcriptIds.filter(id => !transcriptsToProcess.includes(id))
      },
      results: [],
      createdAt: new Date()
    };

    this.jobs.set(jobId, job);

    logger.info('Bulk AI processing job created', {
      jobId,
      transcriptsToProcess: transcriptsToProcess.length,
      totalTranscripts: transcriptIds.length,
      analystTypes: job.analystTypes,
      forceRefresh: request.forceRefresh
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNextJob();
    }

    return { jobId };
  }

  /**
   * Get job status and progress
   */
  getJobStatus(jobId: string): BulkAIJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): BulkAIJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'running' && this.currentJobId === jobId) {
      job.status = 'cancelled';
      this.isProcessing = false;
      this.currentJobId = undefined;
      logger.info('Bulk AI job cancelled', { jobId });
      this.emit('jobCancelled', jobId);
      return true;
    } else if (job.status === 'pending') {
      job.status = 'cancelled';
      logger.info('Bulk AI job cancelled (was pending)', { jobId });
      this.emit('jobCancelled', jobId);
      return true;
    }

    return false;
  }

  /**
   * Process the next job in queue
   */
  private async processNextJob(): Promise<void> {
    if (this.isProcessing) return;

    // Find next pending job
    const pendingJob = Array.from(this.jobs.values()).find(job => job.status === 'pending');
    if (!pendingJob) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    this.currentJobId = pendingJob.id;
    pendingJob.status = 'running';
    pendingJob.startedAt = new Date();

    logger.info('Starting bulk AI processing job', {
      jobId: pendingJob.id,
      transcriptsToProcess: pendingJob.transcriptIds.length
    });

    this.emit('jobStarted', pendingJob.id);

    try {
      await this.processJob(pendingJob);
      
      pendingJob.status = 'completed';
      pendingJob.completedAt = new Date();
      
      logger.info('Bulk AI processing job completed', {
        jobId: pendingJob.id,
        processed: pendingJob.progress.processed.length,
        failed: pendingJob.progress.failed.length,
        skipped: pendingJob.progress.skipped.length
      });

      this.emit('jobCompleted', pendingJob.id);
    } catch (error) {
      pendingJob.status = 'failed';
      pendingJob.error = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Bulk AI processing job failed', {
        jobId: pendingJob.id,
        error: pendingJob.error
      });

      this.emit('jobFailed', pendingJob.id, pendingJob.error);
    } finally {
      this.isProcessing = false;
      this.currentJobId = undefined;
      
      // Process next job if any
      setTimeout(() => this.processNextJob(), 1000);
    }
  }

  /**
   * Process a single job with parallel execution and batching
   */
  private async processJob(job: BulkAIJob): Promise<void> {
    const startTime = Date.now();
    const concurrency = 3; // Number of parallel operations
    const batchSize = 10; // Process in batches for memory efficiency
    
    logger.info('Starting parallel AI processing', {
      jobId: job.id,
      totalTranscripts: job.transcriptIds.length,
      concurrency,
      batchSize
    });
    
    // Process transcripts in batches
    for (let batchStart = 0; batchStart < job.transcriptIds.length; batchStart += batchSize) {
      if (job.status === 'cancelled') {
        logger.info('Job cancelled, stopping processing', { jobId: job.id });
        break;
      }

      const batchEnd = Math.min(batchStart + batchSize, job.transcriptIds.length);
      const batchTranscripts = job.transcriptIds.slice(batchStart, batchEnd);
      
      logger.info(`Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(job.transcriptIds.length / batchSize)}`, {
        jobId: job.id,
        batchSize: batchTranscripts.length,
        progress: `${batchStart}/${job.transcriptIds.length}`
      });
      
      // Process batch with limited concurrency
      await this.processBatchParallel(job, batchTranscripts, concurrency, startTime);
      
      // Small delay between batches to prevent overwhelming the AI services
      if (batchEnd < job.transcriptIds.length) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay between batches
      }
    }
  }
  
  /**
   * Process a batch of transcripts in parallel with controlled concurrency
   */
  private async processBatchParallel(
    job: BulkAIJob, 
    transcriptIds: string[], 
    concurrency: number,
    startTime: number
  ): Promise<void> {
    // Create a semaphore for concurrency control
    let activePromises = 0;
    const results: Array<{ transcriptId: string; result?: any; error?: string }> = [];
    
    const processTranscript = async (transcriptId: string): Promise<void> => {
      activePromises++;
      
      try {
        // Update current transcript for progress tracking
        job.progress.currentTranscript = transcriptId;
        this.emit('jobProgress', job.id, job.progress);
        
        const result = await this.processTranscriptAI(transcriptId, job.analystTypes, job.forceRefresh);
        
        results.push({ transcriptId, result });
        job.results.push(result);
        job.progress.processed.push(transcriptId);
        job.progress.current = job.progress.processed.length;

        // Calculate estimated time remaining
        if (job.progress.current > 0) {
          const elapsed = Date.now() - startTime;
          const avgTimePerTranscript = elapsed / job.progress.current;
          const remaining = (job.transcriptIds.length - job.progress.current) * avgTimePerTranscript;
          job.estimatedTimeRemaining = Math.round(remaining / 1000); // seconds
        }

        logger.info('Transcript AI processing completed', {
          jobId: job.id,
          transcriptId,
          status: result.status,
          summariesGenerated: result.summariesGenerated,
          progress: `${job.progress.current}/${job.progress.total}`
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        results.push({ transcriptId, error: errorMessage });
        job.results.push({
          transcriptId,
          ticker: '', // Will be filled in processTranscriptAI
          year: 0,
          quarter: 0,
          status: 'failed',
          summariesGenerated: 0,
          error: errorMessage
        });
        job.progress.failed.push(transcriptId);
        job.progress.current = job.progress.processed.length;

        logger.error('Transcript AI processing failed', {
          jobId: job.id,
          transcriptId,
          error: errorMessage
        });
      } finally {
        activePromises--;
      }
    };
    
    // Process with controlled concurrency
    const promises: Promise<void>[] = [];
    
    for (const transcriptId of transcriptIds) {
      if (job.status === 'cancelled') break;
      
      // Wait if we've reached max concurrency
      while (activePromises >= concurrency) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      promises.push(processTranscript(transcriptId));
    }
    
    // Wait for all promises in this batch to complete
    await Promise.allSettled(promises);
    
    // Emit progress update for the batch
    this.emit('jobProgress', job.id, job.progress);
  }

  /**
   * Process AI summaries for a single transcript
   */
  private async processTranscriptAI(
    transcriptId: string, 
    analystTypes: string[], 
    forceRefresh: boolean
  ): Promise<BulkAIProcessingResult> {
    const startTime = Date.now();

    // Get transcript details
    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
      select: { id: true, ticker: true, year: true, quarter: true, fullTranscript: true }
    });

    if (!transcript) {
      throw new Error(`Transcript not found: ${transcriptId}`);
    }

    // Check if summaries already exist (unless force refresh)
    if (!forceRefresh) {
      const existingSummaries = await this.googleAIService.getAISummariesFromDatabase(transcriptId);
      if (existingSummaries.length > 0) {
        return {
          transcriptId,
          ticker: transcript.ticker,
          year: transcript.year,
          quarter: transcript.quarter,
          status: 'skipped',
          summariesGenerated: existingSummaries.length,
          processingTime: Date.now() - startTime
        };
      }
    }

    // Generate AI summaries
    const multipleSummaries = await this.googleAIService.generateMultipleSummaries(
      transcript.ticker,
      `${transcript.year}Q${transcript.quarter}`,
      transcript.fullTranscript
    );

    // Save to database
    await this.googleAIService.saveAISummariesToDatabase(
      transcriptId,
      multipleSummaries.responses
    );

    return {
      transcriptId,
      ticker: transcript.ticker,
      year: transcript.year,
      quarter: transcript.quarter,
      status: 'success',
      summariesGenerated: multipleSummaries.successCount,
      processingTime: Date.now() - startTime
    };
  }
}