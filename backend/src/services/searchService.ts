import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { SearchFilters, SearchResponse, SearchResult } from '@/types';

export class SearchService {
  /**
   * Search transcripts using keyword search with PostgreSQL full-text search
   */
  async searchKeywords(
    query: string,
    filters: SearchFilters,
    highlight: boolean = true
  ): Promise<SearchResponse> {
    const startTime = Date.now();

    // Build the WHERE clause
    const whereClause = this.buildWhereClause(filters);
    
    // Use PostgreSQL full-text search
    const searchQuery = query.replace(/[^\w\s]/g, '').trim();
    const tsQuery = searchQuery.split(/\s+/).join(' & ');

    const sql = `
      SELECT 
        t.id,
        t.ticker,
        t.company_name as "companyName",
        t.year,
        t.quarter,
        t.call_date as "callDate",
        ${highlight 
          ? `ts_headline('english', t.full_transcript, plainto_tsquery('english', $1), 'MaxWords=50, MinWords=20') as snippet,`
          : `SUBSTRING(t.full_transcript, 1, 200) as snippet,`
        }
        ts_rank(to_tsvector('english', t.full_transcript), plainto_tsquery('english', $1)) as relevance_score,
        (length(t.full_transcript) - length(replace(lower(t.full_transcript), lower($1), ''))) / length($1) as match_count
      FROM transcripts t
      WHERE to_tsvector('english', t.full_transcript) @@ plainto_tsquery('english', $1)
      ${whereClause.sql}
      ORDER BY relevance_score DESC, t.call_date DESC
      LIMIT $${whereClause.params.length + 2} OFFSET $${whereClause.params.length + 3}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM transcripts t
      WHERE to_tsvector('english', t.full_transcript) @@ plainto_tsquery('english', $1)
      ${whereClause.sql}
    `;

    const params = [searchQuery, ...whereClause.params, filters.limit, filters.offset];
    const countParams = [searchQuery, ...whereClause.params];

    try {
      const [results, countResult] = await Promise.all([
        prisma.$queryRawUnsafe(sql, ...params) as Promise<any[]>,
        prisma.$queryRawUnsafe(countSql, ...countParams) as Promise<{ total: bigint }[]>,
      ]);

      const searchResults: SearchResult[] = results.map(row => ({
        id: row.id,
        ticker: row.ticker,
        companyName: row.companyName,
        year: row.year,
        quarter: row.quarter,
        callDate: row.callDate,
        snippet: row.snippet || '',
        relevanceScore: parseFloat(row.relevance_score) || 0,
        matchCount: parseInt(row.match_count) || 0,
      }));

      const total = Number(countResult[0]?.total || 0);
      const executionTime = Date.now() - startTime;

      return {
        results: searchResults,
        total,
        page: Math.floor(filters.offset / filters.limit) + 1,
        limit: filters.limit,
        executionTime,
        query,
        filters,
      };
    } catch (error) {
      logger.error('Keyword search failed', {
        query,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Search transcripts using regex patterns
   */
  async searchRegex(
    pattern: string,
    filters: SearchFilters,
    highlight: boolean = true
  ): Promise<SearchResponse> {
    const startTime = Date.now();

    try {
      // Validate regex pattern
      new RegExp(pattern, 'gi');
    } catch (error) {
      throw new Error('Invalid regex pattern');
    }

    const whereClause = this.buildWhereClause(filters);

    const sql = `
      SELECT 
        t.id,
        t.ticker,
        t.company_name as "companyName",
        t.year,
        t.quarter,
        t.call_date as "callDate",
        ${highlight
          ? `SUBSTRING(t.full_transcript FROM position(regexp_replace($1, '[()\\[\\]{}+*?^$|.]', '\\\\&', 'g') in t.full_transcript) - 100 FOR 200) as snippet,`
          : `SUBSTRING(t.full_transcript, 1, 200) as snippet,`
        }
        0 as relevance_score,
        (length(t.full_transcript) - length(regexp_replace(t.full_transcript, $1, '', 'gi'))) as match_count
      FROM transcripts t
      WHERE t.full_transcript ~* $1
      ${whereClause.sql}
      ORDER BY t.call_date DESC
      LIMIT $${whereClause.params.length + 2} OFFSET $${whereClause.params.length + 3}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM transcripts t
      WHERE t.full_transcript ~* $1
      ${whereClause.sql}
    `;

    const params = [pattern, ...whereClause.params, filters.limit, filters.offset];
    const countParams = [pattern, ...whereClause.params];

    try {
      const [results, countResult] = await Promise.all([
        prisma.$queryRawUnsafe(sql, ...params) as Promise<any[]>,
        prisma.$queryRawUnsafe(countSql, ...countParams) as Promise<{ total: bigint }[]>,
      ]);

      const searchResults: SearchResult[] = results.map(row => ({
        id: row.id,
        ticker: row.ticker,
        companyName: row.companyName,
        year: row.year,
        quarter: row.quarter,
        callDate: row.callDate,
        snippet: row.snippet || '',
        relevanceScore: 0,
        matchCount: parseInt(row.match_count) || 0,
      }));

      const total = Number(countResult[0]?.total || 0);
      const executionTime = Date.now() - startTime;

      return {
        results: searchResults,
        total,
        page: Math.floor(filters.offset / filters.limit) + 1,
        limit: filters.limit,
        executionTime,
        query: pattern,
        filters,
      };
    } catch (error) {
      logger.error('Regex search failed', {
        pattern,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Fuzzy search implementation
   */
  async searchFuzzy(
    query: string,
    filters: SearchFilters,
    options: any = {}
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const similarity = options.similarity || 0.3;

    const whereClause = this.buildWhereClause(filters);

    const sql = `
      SELECT 
        t.id,
        t.ticker,
        t.company_name as "companyName",
        t.year,
        t.quarter,
        t.call_date as "callDate",
        SUBSTRING(t.full_transcript, 1, 200) as snippet,
        similarity(t.full_transcript, $1) as relevance_score,
        0 as match_count
      FROM transcripts t
      WHERE similarity(t.full_transcript, $1) > $2
      ${whereClause.sql}
      ORDER BY relevance_score DESC, t.call_date DESC
      LIMIT $${whereClause.params.length + 3} OFFSET $${whereClause.params.length + 4}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM transcripts t
      WHERE similarity(t.full_transcript, $1) > $2
      ${whereClause.sql}
    `;

    const params = [query, similarity, ...whereClause.params, filters.limit, filters.offset];
    const countParams = [query, similarity, ...whereClause.params];

    try {
      const [results, countResult] = await Promise.all([
        prisma.$queryRawUnsafe(sql, ...params) as Promise<any[]>,
        prisma.$queryRawUnsafe(countSql, ...countParams) as Promise<{ total: bigint }[]>,
      ]);

      const searchResults: SearchResult[] = results.map(row => ({
        id: row.id,
        ticker: row.ticker,
        companyName: row.companyName,
        year: row.year,
        quarter: row.quarter,
        callDate: row.callDate,
        snippet: row.snippet || '',
        relevanceScore: parseFloat(row.relevance_score) || 0,
        matchCount: 0,
      }));

      const total = Number(countResult[0]?.total || 0);
      const executionTime = Date.now() - startTime;

      return {
        results: searchResults,
        total,
        page: Math.floor(filters.offset / filters.limit) + 1,
        limit: filters.limit,
        executionTime,
        query,
        filters,
      };
    } catch (error) {
      logger.error('Fuzzy search failed', {
        query,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get search suggestions based on query
   */
  async getSuggestions(query: string, limit: number = 10): Promise<string[]> {
    const sql = `
      SELECT DISTINCT
        regexp_split_to_table(
          regexp_replace(full_transcript, '[^a-zA-Z0-9\\s]', ' ', 'g'), 
          '\\s+'
        ) as word
      FROM transcripts
      WHERE regexp_split_to_table(
        regexp_replace(full_transcript, '[^a-zA-Z0-9\\s]', ' ', 'g'), 
        '\\s+'
      ) ILIKE $1
      AND length(regexp_split_to_table(
        regexp_replace(full_transcript, '[^a-zA-Z0-9\\s]', ' ', 'g'), 
        '\\s+'
      )) > 3
      ORDER BY word
      LIMIT $2
    `;

    try {
      const results = await prisma.$queryRawUnsafe(sql, `${query}%`, limit) as { word: string }[];
      return results.map(r => r.word).filter(word => word.length > 3);
    } catch (error) {
      logger.error('Suggestions query failed', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Log search for analytics
   */
  async logSearch(searchLog: {
    query: string;
    filters: any;
    resultCount: number;
    executionTime: number;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await prisma.searchLog.create({
        data: {
          query: searchLog.query,
          filters: searchLog.filters,
          resultCount: searchLog.resultCount,
          executionTime: searchLog.executionTime,
          userAgent: searchLog.userAgent,
          ipAddress: searchLog.ipAddress,
        },
      });
    } catch (error) {
      logger.error('Failed to log search', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Build WHERE clause for filtering
   */
  private buildWhereClause(filters: SearchFilters): { sql: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 2; // Start from 2 since $1 is the search query

    if (filters.tickers && filters.tickers.length > 0) {
      conditions.push(`t.ticker = ANY($${paramIndex})`);
      params.push(filters.tickers);
      paramIndex++;
    }

    if (filters.years && filters.years.length > 0) {
      conditions.push(`t.year = ANY($${paramIndex})`);
      params.push(filters.years);
      paramIndex++;
    }

    if (filters.quarters && filters.quarters.length > 0) {
      conditions.push(`t.quarter = ANY($${paramIndex})`);
      params.push(filters.quarters);
      paramIndex++;
    }

    if (filters.dateFrom) {
      conditions.push(`t.call_date >= $${paramIndex}`);
      params.push(new Date(filters.dateFrom));
      paramIndex++;
    }

    if (filters.dateTo) {
      conditions.push(`t.call_date <= $${paramIndex}`);
      params.push(new Date(filters.dateTo));
      paramIndex++;
    }

    const sql = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
    return { sql, params };
  }

  /**
   * Search AI summaries using keyword search
   */
  async searchAISummaries(
    query: string,
    filters: SearchFilters,
    highlight: boolean = true
  ): Promise<SearchResponse> {
    const startTime = Date.now();

    // Build the WHERE clause for transcripts (since AI summaries are linked to transcripts)
    const whereClause = this.buildWhereClause(filters);
    
    // Use PostgreSQL full-text search on AI summary content
    const searchQuery = query.replace(/[^\w\s]/g, '').trim();
    const tsQuery = searchQuery.split(/\s+/).join(' & ');

    const sql = `
      SELECT 
        t.id,
        t.ticker,
        t.company_name as "companyName",
        t.year,
        t.quarter,
        t.call_date as "callDate",
        ai.analyst_type as "analystType",
        ${highlight 
          ? `ts_headline('english', ai.content, plainto_tsquery('english', $1), 'MaxWords=50, MinWords=20') as snippet,`
          : `SUBSTRING(ai.content, 1, 200) as snippet,`
        }
        ts_rank(to_tsvector('english', ai.content), plainto_tsquery('english', $1)) as "relevanceScore",
        (length(ai.content) - length(replace(lower(ai.content), lower($1), ''))) / length($1) as "matchCount",
        'ai_summary' as "source_type",
        ai.id as "ai_summary_id"
      FROM ai_summaries ai
      JOIN transcripts t ON ai.transcript_id = t.id
      WHERE to_tsvector('english', ai.content) @@ plainto_tsquery('english', $1)
      ${whereClause.sql}
      ORDER BY "relevanceScore" DESC, t.call_date DESC
      LIMIT $${whereClause.params.length + 2} OFFSET $${whereClause.params.length + 3}
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM ai_summaries ai
      JOIN transcripts t ON ai.transcript_id = t.id
      WHERE to_tsvector('english', ai.content) @@ plainto_tsquery('english', $1)
      ${whereClause.sql}
    `;

    const params = [searchQuery, ...whereClause.params, filters.limit, filters.offset];
    const countParams = [searchQuery, ...whereClause.params];

    try {
      const [results, countResult] = await Promise.all([
        prisma.$queryRawUnsafe(sql, ...params),
        prisma.$queryRawUnsafe(countSql, ...countParams)
      ]);

      const total = Number((countResult as any)[0]?.total || 0);
      const executionTime = Date.now() - startTime;

      return {
        results: results as SearchResult[],
        total,
        hasMore: total > filters.offset + filters.limit,
        executionTime,
        query,
        filters,
      };
    } catch (error) {
      logger.error('AI summary search failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query,
        filters,
      });

      throw error;
    }
  }

  /**
   * Search both transcripts and AI summaries combined
   */
  async searchCombined(
    query: string,
    filters: SearchFilters,
    highlight: boolean = true
  ): Promise<SearchResponse> {
    const startTime = Date.now();

    // Get results from both transcripts and AI summaries
    const [transcriptResults, aiResults] = await Promise.all([
      this.searchKeywords(query, filters, highlight),
      this.searchAISummaries(query, filters, highlight)
    ]);

    // Combine and sort results by relevance
    const combinedResults = [
      ...transcriptResults.results.map(r => ({...r, source_type: 'transcript' as const})),
      ...aiResults.results
    ].sort((a, b) => ((b.relevanceScore || 0) as number) - ((a.relevanceScore || 0) as number));

    // Apply limit and offset to combined results
    const total = transcriptResults.total + aiResults.total;
    const paginatedResults = combinedResults.slice(filters.offset, filters.offset + filters.limit);

    const executionTime = Date.now() - startTime;

    return {
      results: paginatedResults,
      total,
      hasMore: total > filters.offset + filters.limit,
      executionTime,
      query,
      filters,
      breakdown: {
        transcripts: transcriptResults.total,
        aiSummaries: aiResults.total
      }
    };
  }
}

// Export singleton instance
export const searchService = new SearchService(); 