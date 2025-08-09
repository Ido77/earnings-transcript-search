import { z } from 'zod';

// API Ninjas response types
export interface ApiNinjasTranscriptResponse {
  ticker: string;
  quarter: number;
  year: number;
  date: string;
  transcript: string;
}

// Premium transcript_split response types
export interface ApiNinjasTranscriptSplitResponse {
  ticker: string;
  quarter: number;
  year: number;
  date: string;
  transcript_split: TranscriptSplitSegment[];
}

export interface TranscriptSplitSegment {
  speaker: string;
  company?: string;
  role?: string;
  text: string;
}

// Quarter calculation types
export interface Quarter {
  year: number;
  quarter: number;
}

export interface QuarterRange {
  startYear: number;
  startQuarter: number;
  endYear: number;
  endQuarter: number;
}

// Search related types
export const SearchFiltersSchema = z.object({
  tickers: z.array(z.string()).optional(),
  years: z.array(z.number()).optional(),
  quarters: z.array(z.number().min(1).max(4)).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  speakers: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export interface SearchResult {
  id: string;
  ticker: string;
  companyName: string | null;
  year: number;
  quarter: number;
  callDate: Date | null;
  snippet: string;
  relevanceScore?: number;
  matchCount: number;
  source_type?: 'transcript' | 'ai_summary';
  analystType?: string; // For AI summary results
  ai_summary_id?: string; // For AI summary results
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
  executionTime: number;
  query: string;
  filters: SearchFilters;
  breakdown?: {
    transcripts: number;
    aiSummaries: number;
  };
}

// Bulk fetch types
export const BulkFetchRequestSchema = z.object({
  tickers: z.array(z.string().min(1).max(10)).min(1).max(100),
  quarters: z.array(z.object({
    year: z.number().min(2000).max(2030),
    quarter: z.number().min(1).max(4),
  })).optional(),
  forceRefresh: z.boolean().default(false),
});

export type BulkFetchRequest = z.infer<typeof BulkFetchRequestSchema>;

export interface BulkFetchResult {
  ticker: string;
  year?: number;
  quarter?: number;
  status: 'success' | 'failed' | 'skipped' | 'not_available';
  transcriptLength?: number;
  transcriptId?: string;
  storage?: 'database' | 'memory' | 'cached' | 'memory_fallback';
  error?: string;
  skipped?: boolean;
}

export interface BulkFetchResponse {
  results: BulkFetchResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  executionTime: number;
}

// Job system types
export interface BulkFetchJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  tickers: string[];
  quarters?: Array<{ year: number; quarter: number }>;
  quarterCount?: number; // Number of quarters to try for each ticker
  progress: {
    current: number;
    total: number;
    currentTicker?: string;
    processed: string[];
    failed: string[];
    skipped: string[];
    failedDetails?: Array<{ ticker: string; reason: string }>;
  };
  results: BulkFetchResult[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface JobProgress {
  jobId: string;
  status: BulkFetchJob['status'];
  progress: BulkFetchJob['progress'];
  estimatedTimeRemaining?: number;
  lastUpdate: Date;
}

// Statistics types
export interface TranscriptStats {
  totalTranscripts: number;
  uniqueTickers: number;
  dateRange: {
    earliest: Date | null;
    latest: Date | null;
  };
  quarterDistribution: Record<string, number>;
  topTickers: Array<{
    ticker: string;
    count: number;
    companyName?: string;
  }>;
}

export interface SearchStats {
  totalSearches: number;
  averageExecutionTime: number;
  topQueries: Array<{
    query: string;
    count: number;
    averageResults: number;
  }>;
  queryTypeDistribution: {
    keyword: number;
    regex: number;
    filtered: number;
  };
}

// Transcript parsing types
export interface TranscriptSpeaker {
  name: string;
  role?: string;
  company?: string;
}

export interface TranscriptSegment {
  speaker: TranscriptSpeaker;
  text: string;
  timestamp?: string;
  type?: 'presentation' | 'qa' | 'operator';
}

export interface ParsedTranscript {
  metadata: {
    ticker: string;
    companyName?: string;
    quarter: number;
    year: number;
    date?: string;
    participantCount?: number;
  };
  segments: TranscriptSegment[];
  fullText: string;
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

// AI Summary types
export interface AISummaryData {
  id: string;
  transcriptId: string;
  analystType: string;
  content: string;
  processingTime: number;
  hasHiddenGoldmine: boolean;
  hasBoringQuote: boolean;
  hasSizePotential: boolean;
  searchQuery: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BulkAIProcessingRequest {
  transcriptIds?: string[];
  tickers?: string[];
  processAllTranscripts?: boolean; // Process ALL transcripts in database
  forceRefresh?: boolean;
  analystTypes?: string[]; // ['Claude', 'Gemini', 'DeepSeek', 'Grok']
}

export interface BulkAIProcessingResult {
  transcriptId: string;
  ticker: string;
  year: number;
  quarter: number;
  status: 'success' | 'failed' | 'skipped';
  summariesGenerated: number;
  error?: string;
  processingTime?: number;
}

export interface BulkAIProcessingResponse {
  results: BulkAIProcessingResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    totalSummariesGenerated: number;
  };
  executionTime: number;
}

// Express request extensions
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
} 