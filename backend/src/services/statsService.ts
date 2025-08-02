import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { checkDatabaseHealth } from '@/config/database';

export class StatsService {
  /**
   * Get overall system statistics
   */
  async getSystemStats() {
    try {
      const [
        transcriptCount,
        tickerCount,
        searchCount,
        dateRange,
      ] = await Promise.all([
        prisma.transcript.count(),
        prisma.transcript.groupBy({
          by: ['ticker'],
          _count: { ticker: true },
        }),
        prisma.searchLog.count(),
        prisma.transcript.aggregate({
          _min: { callDate: true },
          _max: { callDate: true },
        }),
      ]);

      return {
        transcripts: {
          total: transcriptCount,
          uniqueTickers: tickerCount.length,
        },
        searches: {
          total: searchCount,
        },
        dateRange: {
          earliest: dateRange._min.callDate,
          latest: dateRange._max.callDate,
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get system stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get transcript-related statistics
   */
  async getTranscriptStats(
    groupBy?: 'ticker' | 'quarter' | 'year' | 'month',
    filters?: {
      dateFrom?: string;
      dateTo?: string;
    }
  ) {
    try {
      const whereClause: any = {};

      if (filters?.dateFrom || filters?.dateTo) {
        whereClause.callDate = {};
        if (filters.dateFrom) {
          whereClause.callDate.gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
          whereClause.callDate.lte = new Date(filters.dateTo);
        }
      }

      const baseStats = await prisma.transcript.aggregate({
        where: whereClause,
        _count: { id: true },
        _min: { callDate: true },
        _max: { callDate: true },
      });

      let groupedData: any[] = [];

      if (groupBy) {
        switch (groupBy) {
          case 'ticker':
            groupedData = await prisma.transcript.groupBy({
              by: ['ticker', 'companyName'],
              where: whereClause,
              _count: { id: true },
              orderBy: { _count: { id: 'desc' } },
              take: 20,
            } as any);
            break;

          case 'quarter':
            groupedData = await prisma.transcript.groupBy({
              by: ['year', 'quarter'],
              where: whereClause,
              _count: { id: true },
              orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
            } as any);
            break;

          case 'year':
            groupedData = await prisma.transcript.groupBy({
              by: ['year'],
              where: whereClause,
              _count: { id: true },
              orderBy: { year: 'desc' },
            } as any);
            break;

          case 'month':
            // For month grouping, we need raw SQL
            const sql = `
              SELECT 
                DATE_TRUNC('month', call_date) as month,
                COUNT(*) as count
              FROM transcripts
              WHERE call_date IS NOT NULL
              ${filters?.dateFrom ? `AND call_date >= '${filters.dateFrom}'` : ''}
              ${filters?.dateTo ? `AND call_date <= '${filters.dateTo}'` : ''}
              GROUP BY DATE_TRUNC('month', call_date)
              ORDER BY month DESC
            `;
            groupedData = await prisma.$queryRawUnsafe(sql);
            break;
        }
      }

      return {
        total: baseStats._count.id,
        dateRange: {
          earliest: baseStats._min.callDate,
          latest: baseStats._max.callDate,
        },
        groupedData: groupedData.map(item => ({
          ...item,
          count: Number(item._count?.id || item.count),
        })),
      };
    } catch (error) {
      logger.error('Failed to get transcript stats', {
        groupBy,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get search-related statistics
   */
  async getSearchStats(
    period: 'hour' | 'day' | 'week' | 'month' = 'day',
    limit: number = 20
  ) {
    try {
      const periodMap = {
        hour: '1 hour',
        day: '1 day',
        week: '1 week',
        month: '1 month',
      };

      const sql = `
        SELECT 
          COUNT(*) as total_searches,
          AVG(execution_time) as avg_execution_time,
          MAX(execution_time) as max_execution_time,
          MIN(execution_time) as min_execution_time
        FROM search_logs
        WHERE created_at >= NOW() - INTERVAL '${periodMap[period]}'
      `;

      const topQueriesSql = `
        SELECT 
          query,
          COUNT(*) as search_count,
          AVG(result_count) as avg_results,
          AVG(execution_time) as avg_execution_time
        FROM search_logs
        WHERE created_at >= NOW() - INTERVAL '${periodMap[period]}'
        GROUP BY query
        ORDER BY search_count DESC
        LIMIT $1
      `;

      const [overallStats, topQueries] = await Promise.all([
        prisma.$queryRawUnsafe(sql) as Promise<any[]>,
        prisma.$queryRawUnsafe(topQueriesSql, limit) as Promise<any[]>,
      ]);

      return {
        period,
        overall: {
          totalSearches: Number(overallStats[0]?.total_searches || 0),
          averageExecutionTime: Number(overallStats[0]?.avg_execution_time || 0),
          maxExecutionTime: Number(overallStats[0]?.max_execution_time || 0),
          minExecutionTime: Number(overallStats[0]?.min_execution_time || 0),
        },
        topQueries: topQueries.map(q => ({
          query: q.query,
          searchCount: Number(q.search_count),
          averageResults: Number(q.avg_results),
          averageExecutionTime: Number(q.avg_execution_time),
        })),
      };
    } catch (error) {
      logger.error('Failed to get search stats', {
        period,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get performance statistics
   */
  async getPerformanceStats(
    metric: 'response_time' | 'search_time' | 'fetch_time' = 'response_time',
    timeframe: '1h' | '24h' | '7d' | '30d' = '24h'
  ) {
    try {
      const timeframeMap = {
        '1h': '1 hour',
        '24h': '1 day',
        '7d': '7 days',
        '30d': '30 days',
      };

      // For now, we'll use search execution time as a proxy for performance
      const sql = `
        SELECT 
          DATE_TRUNC('hour', created_at) as time_bucket,
          AVG(execution_time) as avg_time,
          MIN(execution_time) as min_time,
          MAX(execution_time) as max_time,
          COUNT(*) as request_count
        FROM search_logs
        WHERE created_at >= NOW() - INTERVAL '${timeframeMap[timeframe]}'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY time_bucket DESC
      `;

      const results = await prisma.$queryRawUnsafe(sql) as any[];

      return {
        metric,
        timeframe,
        data: results.map(r => ({
          timestamp: r.time_bucket,
          averageTime: Number(r.avg_time),
          minTime: Number(r.min_time),
          maxTime: Number(r.max_time),
          requestCount: Number(r.request_count),
        })),
      };
    } catch (error) {
      logger.error('Failed to get performance stats', {
        metric,
        timeframe,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get data coverage statistics
   */
  async getCoverageStats(tickers?: string[]) {
    try {
      const whereClause = tickers && tickers.length > 0 
        ? { ticker: { in: tickers } }
        : {};

      const coverageData = await prisma.transcript.groupBy({
        by: ['ticker', 'year', 'quarter'],
        where: whereClause,
        _count: { id: true },
        orderBy: [
          { ticker: 'asc' },
          { year: 'desc' },
          { quarter: 'desc' },
        ],
      });

      // Calculate coverage matrix
      const tickerCoverage: Record<string, any> = {};
      
      coverageData.forEach(item => {
        if (!tickerCoverage[item.ticker]) {
          tickerCoverage[item.ticker] = {
            ticker: item.ticker,
            quarters: [],
            totalQuarters: 0,
          };
        }
        
        tickerCoverage[item.ticker].quarters.push({
          year: item.year,
          quarter: item.quarter,
          hasData: true,
        });
        tickerCoverage[item.ticker].totalQuarters++;
      });

      // Calculate missing quarters for each ticker
      const currentYear = new Date().getFullYear();
      const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
      
      Object.values(tickerCoverage).forEach((ticker: any) => {
        const missingQuarters = [];
        
        // Check last 4 quarters for missing data
        for (let i = 0; i < 4; i++) {
          let checkYear = currentYear;
          let checkQuarter = currentQuarter - i;
          
          if (checkQuarter <= 0) {
            checkQuarter += 4;
            checkYear--;
          }
          
          const hasQuarter = ticker.quarters.some(
            (q: any) => q.year === checkYear && q.quarter === checkQuarter
          );
          
          if (!hasQuarter) {
            missingQuarters.push({ year: checkYear, quarter: checkQuarter });
          }
        }
        
        ticker.missingQuarters = missingQuarters;
        ticker.coveragePercentage = (ticker.totalQuarters / 4) * 100;
      });

      return {
        tickers: Object.values(tickerCoverage),
        summary: {
          totalTickers: Object.keys(tickerCoverage).length,
          averageCoverage: Object.values(tickerCoverage).reduce(
            (sum: number, t: any) => sum + t.coveragePercentage, 0
          ) / Object.keys(tickerCoverage).length,
        },
      };
    } catch (error) {
      logger.error('Failed to get coverage stats', {
        tickers,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get top search queries
   */
  async getTopSearchQueries(
    period: 'day' | 'week' | 'month' | 'year' = 'week',
    limit: number = 20,
    type: 'keyword' | 'regex' | 'all' = 'all'
  ) {
    try {
      const periodMap = {
        day: '1 day',
        week: '1 week',
        month: '1 month',
        year: '1 year',
      };

      let typeFilter = '';
      if (type === 'regex') {
        typeFilter = `AND query ~ '^[\\[\\(\\^\\$\\|\\*\\+\\?\\{\\\\]'`;
      } else if (type === 'keyword') {
        typeFilter = `AND query !~ '^[\\[\\(\\^\\$\\|\\*\\+\\?\\{\\\\]'`;
      }

      const sql = `
        SELECT 
          query,
          COUNT(*) as search_count,
          AVG(result_count) as avg_results,
          AVG(execution_time) as avg_execution_time,
          MAX(created_at) as last_searched
        FROM search_logs
        WHERE created_at >= NOW() - INTERVAL '${periodMap[period]}'
        ${typeFilter}
        GROUP BY query
        ORDER BY search_count DESC
        LIMIT $1
      `;

      const results = await prisma.$queryRawUnsafe(sql, limit) as any[];

      return results.map(r => ({
        query: r.query,
        searchCount: Number(r.search_count),
        averageResults: Number(r.avg_results),
        averageExecutionTime: Number(r.avg_execution_time),
        lastSearched: r.last_searched,
      }));
    } catch (error) {
      logger.error('Failed to get top search queries', {
        period,
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get system health metrics
   */
  async getHealthMetrics() {
    try {
      const [dbHealth, dbStats] = await Promise.all([
        checkDatabaseHealth(),
        this.getDatabaseStats(),
      ]);

      const health = {
        status: 'healthy' as 'healthy' | 'warning' | 'error',
        timestamp: new Date().toISOString(),
        database: {
          connected: dbHealth,
          ...dbStats,
        },
        api: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
        },
      };

      // Determine overall health status
      if (!dbHealth) {
        health.status = 'error';
      } else if (health.api.memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
        health.status = 'warning';
      }

      return health;
    } catch (error) {
      logger.error('Failed to get health metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        status: 'error' as const,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get API usage statistics
   */
  async getApiUsageStats(timeframe: '1h' | '24h' | '7d' | '30d' = '24h') {
    try {
      const timeframeMap = {
        '1h': '1 hour',
        '24h': '1 day',
        '7d': '7 days',
        '30d': '30 days',
      };

      const sql = `
        SELECT 
          DATE_TRUNC('hour', created_at) as time_bucket,
          COUNT(*) as request_count,
          COUNT(DISTINCT ip_address) as unique_users,
          AVG(execution_time) as avg_response_time
        FROM search_logs
        WHERE created_at >= NOW() - INTERVAL '${timeframeMap[timeframe]}'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY time_bucket DESC
      `;

      const results = await prisma.$queryRawUnsafe(sql) as any[];

      return {
        timeframe,
        data: results.map(r => ({
          timestamp: r.time_bucket,
          requestCount: Number(r.request_count),
          uniqueUsers: Number(r.unique_users),
          averageResponseTime: Number(r.avg_response_time),
        })),
        summary: {
          totalRequests: results.reduce((sum, r) => sum + Number(r.request_count), 0),
          totalUniqueUsers: Math.max(...results.map(r => Number(r.unique_users))),
          averageResponseTime: results.reduce((sum, r) => sum + Number(r.avg_response_time), 0) / results.length,
        },
      };
    } catch (error) {
      logger.error('Failed to get API usage stats', {
        timeframe,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  private async getDatabaseStats() {
    try {
      const sql = `
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as database_size,
          pg_size_pretty(pg_total_relation_size('transcripts')) as transcripts_table_size,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
      `;

      const result = await prisma.$queryRawUnsafe(sql) as any[];
      
      return {
        size: result[0]?.database_size || 'Unknown',
        transcriptsTableSize: result[0]?.transcripts_table_size || 'Unknown',
        activeConnections: Number(result[0]?.active_connections || 0),
      };
    } catch (error) {
      return {
        size: 'Unknown',
        transcriptsTableSize: 'Unknown',
        activeConnections: 0,
      };
    }
  }
}

// Export singleton instance
export const statsService = new StatsService(); 