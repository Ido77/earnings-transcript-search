import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { apiNinjasService } from './apiNinjas';
import { BulkFetchResult, BulkFetchResponse, Quarter, ParsedTranscript } from '@/types';
import { stringify } from 'csv-stringify/sync';

export class TranscriptService {
  /**
   * Bulk fetch transcripts for multiple tickers
   */
  async bulkFetchTranscripts(
    tickers: string[],
    quarters: Quarter[],
    forceRefresh: boolean = false
  ): Promise<BulkFetchResponse> {
    const results: BulkFetchResult[] = [];
    const startTime = Date.now();

    logger.info('Starting bulk fetch operation', {
      tickerCount: tickers.length,
      quarterCount: quarters.length,
      forceRefresh,
    });

    for (const ticker of tickers) {
      for (const quarter of quarters) {
        try {
          const result = await this.fetchSingleTranscript(
            ticker,
            quarter.year,
            quarter.quarter,
            forceRefresh
          );
          results.push(result);
        } catch (error) {
          logger.error('Error fetching transcript', {
            ticker,
            year: quarter.year,
            quarter: quarter.quarter,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          results.push({
            ticker,
            year: quarter.year,
            quarter: quarter.quarter,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    const summary = {
      total: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
    };

    const executionTime = Date.now() - startTime;

    logger.info('Bulk fetch operation completed', {
      ...summary,
      executionTime,
    });

    return {
      results,
      summary,
      executionTime,
    };
  }

  /**
   * Fetch a single transcript
   */
  private async fetchSingleTranscript(
    ticker: string,
    year: number,
    quarter: number,
    forceRefresh: boolean = false
  ): Promise<BulkFetchResult> {
    const tickerUpper = ticker.toUpperCase();

    // Check if transcript already exists
    if (!forceRefresh) {
      const existing = await prisma.transcript.findUnique({
        where: {
          ticker_year_quarter: {
            ticker: tickerUpper,
            year,
            quarter,
          },
        },
      });

      if (existing) {
        logger.debug('Transcript already exists, skipping', {
          ticker: tickerUpper,
          year,
          quarter,
        });

        return {
          ticker: tickerUpper,
          year,
          quarter,
          status: 'skipped',
          transcriptId: existing.id,
        };
      }
    }

    // Fetch from API
    const transcriptData = await apiNinjasService.fetchTranscript(
      tickerUpper,
      year,
      quarter
    );

    if (!transcriptData) {
      return {
        ticker: tickerUpper,
        year,
        quarter,
        status: 'failed',
        error: 'Transcript not available from API',
      };
    }

    // Parse transcript date
    let callDate: Date | null = null;
    if (transcriptData.date) {
      try {
        callDate = new Date(transcriptData.date);
      } catch (error) {
        logger.warn('Invalid date format in transcript', {
          ticker: tickerUpper,
          year,
          quarter,
          date: transcriptData.date,
        });
      }
    }

    // Parse transcript into structured format
    const parsedTranscript = this.parseTranscriptText(transcriptData.transcript);

    // Save to database
    const savedTranscript = await prisma.transcript.upsert({
      where: {
        ticker_year_quarter: {
          ticker: tickerUpper,
          year,
          quarter,
        },
      },
      update: {
        fullTranscript: transcriptData.transcript,
        transcriptJson: parsedTranscript,
        callDate,
        updatedAt: new Date(),
      },
      create: {
        ticker: tickerUpper,
        companyName: parsedTranscript.metadata.companyName,
        year,
        quarter,
        callDate,
        fullTranscript: transcriptData.transcript,
        transcriptJson: parsedTranscript,
      },
    });

    logger.info('Transcript saved successfully', {
      ticker: tickerUpper,
      year,
      quarter,
      transcriptId: savedTranscript.id,
      transcriptLength: transcriptData.transcript.length,
    });

    return {
      ticker: tickerUpper,
      year,
      quarter,
      status: 'success',
      transcriptId: savedTranscript.id,
    };
  }

  /**
   * Parse transcript text into structured format
   */
  private parseTranscriptText(transcriptText: string): ParsedTranscript {
    // Basic parsing logic - can be enhanced
    const lines = transcriptText.split('\n').filter(line => line.trim());
    const segments: any[] = [];
    let currentSpeaker: any = null;
    let currentText = '';

    for (const line of lines) {
      // Check if line looks like a speaker identifier
      const speakerMatch = line.match(/^([A-Z][a-zA-Z\s]+)(?:\s*[-–—]|\s*:|\s*\()(.*)$/);
      
      if (speakerMatch) {
        // Save previous segment
        if (currentSpeaker && currentText.trim()) {
          segments.push({
            speaker: currentSpeaker,
            text: currentText.trim(),
          });
        }

        // Start new segment
        currentSpeaker = {
          name: speakerMatch[1].trim(),
        };
        currentText = speakerMatch[2] || '';
      } else if (currentSpeaker) {
        // Continue current speaker's text
        currentText += ' ' + line;
      } else {
        // No speaker identified yet, treat as metadata or introduction
        currentText += line + ' ';
      }
    }

    // Save final segment
    if (currentSpeaker && currentText.trim()) {
      segments.push({
        speaker: currentSpeaker,
        text: currentText.trim(),
      });
    }

    return {
      metadata: {
        ticker: '',
        participantCount: segments.length,
      },
      segments,
      fullText: transcriptText,
    };
  }

  /**
   * Get transcripts with filtering and pagination
   */
  async getTranscripts(
    filters: {
      ticker?: string;
      year?: number;
      quarter?: number;
    },
    pagination: {
      limit: number;
      offset: number;
      sortBy: 'date' | 'ticker' | 'quarter' | 'createdAt';
      sortOrder: 'asc' | 'desc';
    }
  ) {
    const where: any = {};

    if (filters.ticker) {
      where.ticker = filters.ticker.toUpperCase();
    }
    if (filters.year) {
      where.year = filters.year;
    }
    if (filters.quarter) {
      where.quarter = filters.quarter;
    }

    const orderBy: any = {};
    switch (pagination.sortBy) {
      case 'date':
        orderBy.callDate = pagination.sortOrder;
        break;
      case 'ticker':
        orderBy.ticker = pagination.sortOrder;
        break;
      case 'quarter':
        orderBy.year = pagination.sortOrder;
        orderBy.quarter = pagination.sortOrder;
        break;
      case 'createdAt':
        orderBy.createdAt = pagination.sortOrder;
        break;
    }

    const [transcripts, total] = await Promise.all([
      prisma.transcript.findMany({
        where,
        orderBy,
        take: pagination.limit,
        skip: pagination.offset,
        select: {
          id: true,
          ticker: true,
          companyName: true,
          year: true,
          quarter: true,
          callDate: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.transcript.count({ where }),
    ]);

    return {
      transcripts,
      total,
      page: Math.floor(pagination.offset / pagination.limit) + 1,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  /**
   * Get transcript by ID
   */
  async getTranscriptById(id: string) {
    return await prisma.transcript.findUnique({
      where: { id },
    });
  }

  /**
   * Get transcript by ticker, year, quarter
   */
  async getTranscriptByTickerQuarter(ticker: string, year: number, quarter: number) {
    return await prisma.transcript.findUnique({
      where: {
        ticker_year_quarter: {
          ticker: ticker.toUpperCase(),
          year,
          quarter,
        },
      },
    });
  }

  /**
   * Delete a transcript
   */
  async deleteTranscript(id: string): Promise<boolean> {
    try {
      await prisma.transcript.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available quarters for a ticker
   */
  async getAvailableQuarters(ticker: string) {
    const quarters = await prisma.transcript.findMany({
      where: {
        ticker: ticker.toUpperCase(),
      },
      select: {
        year: true,
        quarter: true,
        callDate: true,
      },
      orderBy: [
        { year: 'desc' },
        { quarter: 'desc' },
      ],
    });

    return quarters;
  }

  /**
   * Get available tickers with search
   */
  async getAvailableTickers(options: {
    search?: string;
    limit: number;
    offset: number;
  }) {
    const where: any = {};

    if (options.search) {
      where.OR = [
        {
          ticker: {
            contains: options.search.toUpperCase(),
            mode: 'insensitive',
          },
        },
        {
          companyName: {
            contains: options.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [tickers, total] = await Promise.all([
      prisma.transcript.groupBy({
        by: ['ticker', 'companyName'],
        where,
        take: options.limit,
        skip: options.offset,
        orderBy: {
          ticker: 'asc',
        },
        _count: {
          id: true,
        },
      }),
      prisma.transcript.groupBy({
        by: ['ticker'],
        where,
        _count: {
          id: true,
        },
      }),
    ]);

    return {
      tickers: tickers.map(t => ({
        ticker: t.ticker,
        companyName: t.companyName,
        transcriptCount: t._count.id,
      })),
      total: total.length,
      page: Math.floor(options.offset / options.limit) + 1,
      limit: options.limit,
    };
  }

  /**
   * Get ticker details
   */
  async getTickerDetails(ticker: string) {
    const tickerUpper = ticker.toUpperCase();

    const transcripts = await prisma.transcript.findMany({
      where: { ticker: tickerUpper },
      select: {
        id: true,
        year: true,
        quarter: true,
        callDate: true,
        createdAt: true,
      },
      orderBy: [
        { year: 'desc' },
        { quarter: 'desc' },
      ],
    });

    if (transcripts.length === 0) {
      return null;
    }

    const firstTranscript = await prisma.transcript.findFirst({
      where: { ticker: tickerUpper },
      select: {
        companyName: true,
      },
    });

    return {
      ticker: tickerUpper,
      companyName: firstTranscript?.companyName,
      transcriptCount: transcripts.length,
      quarters: transcripts,
      dateRange: {
        earliest: transcripts[transcripts.length - 1]?.callDate,
        latest: transcripts[0]?.callDate,
      },
    };
  }

  /**
   * Export transcripts to CSV
   */
  async exportToCsv(transcripts: any[]): Promise<string> {
    const records = transcripts.map(t => ({
      ticker: t.ticker,
      companyName: t.companyName || '',
      year: t.year,
      quarter: t.quarter,
      callDate: t.callDate ? t.callDate.toISOString() : '',
      transcriptLength: t.fullTranscript?.length || 0,
      createdAt: t.createdAt.toISOString(),
    }));

    return stringify(records, {
      header: true,
      columns: [
        { key: 'ticker', header: 'Ticker' },
        { key: 'companyName', header: 'Company Name' },
        { key: 'year', header: 'Year' },
        { key: 'quarter', header: 'Quarter' },
        { key: 'callDate', header: 'Call Date' },
        { key: 'transcriptLength', header: 'Transcript Length' },
        { key: 'createdAt', header: 'Created At' },
      ],
    });
  }
}

// Export singleton instance
export const transcriptService = new TranscriptService(); 