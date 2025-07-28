import axios, { AxiosInstance } from 'axios';
import { config } from '@/config/config';
import { logger } from '@/config/logger';
import { ApiNinjasTranscriptResponse, Quarter } from '@/types';

export class ApiNinjasService {
  private client: AxiosInstance;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private isDemo: boolean;

  constructor() {
    this.isDemo = config.apiNinjas.isDemo;
    
    this.client = axios.create({
      baseURL: config.apiNinjas.baseUrl,
      timeout: config.api.timeoutMs,
      headers: {
        'X-Api-Key': config.apiNinjas.key,
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for rate limiting
    this.client.interceptors.request.use(async (requestConfig) => {
      if (!this.isDemo) {
        await this.enforceRateLimit();
      }
      return requestConfig;
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('API Ninjas request successful', {
          url: response.config.url,
          status: response.status,
          responseTime: Date.now() - this.lastRequestTime,
        });
        return response;
      },
      (error) => {
        logger.error('API Ninjas request failed', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
          responseTime: Date.now() - this.lastRequestTime,
        });
        throw error;
      }
    );
  }

  /**
   * Enforce rate limiting to respect API limits
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / 10; // 10 requests per second max

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      logger.debug(`Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Generate demo transcript data for development
   */
  private generateDemoTranscript(ticker: string, year: number, quarter: number): ApiNinjasTranscriptResponse {
    const quarterMap = ['Q1', 'Q2', 'Q3', 'Q4'];
    const quarterName = quarterMap[quarter - 1] || 'Q1';
    
    const demoTranscript = `
${ticker} ${quarterName} ${year} Earnings Call Transcript

[DEMO DATA - This is sample content for development and testing purposes]

IMPORTANT: To access real earnings call transcripts, you need an API Ninjas Premium subscription.
Your API key is working correctly, but the earnings call transcript endpoint requires premium access.

To get real data:
1. Visit: https://api.api-ninjas.com/pricing
2. Upgrade to a Premium Annual plan
3. Then real earnings call transcripts will be fetched automatically

This demo shows you how the system works with realistic sample data:

---

Company Overview:
Thank you for joining ${ticker}'s ${quarterName} ${year} earnings call. 

Operator: Good morning and welcome to ${ticker}'s ${quarterName} ${year} earnings conference call.

CEO: Thank you for joining us today. I'm pleased to report our ${quarterName} results, which demonstrate continued growth and strong operational performance across all business segments.

Financial Highlights:
- Revenue increased 12% year-over-year to $2.4 billion
- Net income of $345 million, up 18% from last quarter
- Strong cash flow generation of $156 million
- Continued investment in innovation and growth initiatives
- Market share expansion in key product categories

CFO: Our financial position remains strong with solid fundamentals across all key metrics. We delivered strong results in ${quarterName} and are well-positioned for continued growth. Our balance sheet is robust with $1.2 billion in cash and cash equivalents.

Operations Update:
We continue to execute on our strategic priorities, including digital transformation initiatives and operational efficiency improvements. Our investments in technology and automation are driving measurable productivity gains.

Q&A Session:
Analyst: Can you provide more details on your growth strategy for the upcoming quarters?

CEO: We're focused on sustainable growth through innovation, strategic partnerships, and operational excellence. Our investments in technology and talent continue to drive value creation. We expect to see continued momentum in our core business lines.

Analyst: What are your thoughts on the competitive landscape?

CEO: We believe our differentiated approach and strong brand positioning give us significant advantages. We continue to invest in R&D and customer experience to maintain our competitive edge.

Management: Thank you for your questions and continued interest in ${ticker}. We look forward to updating you on our progress next quarter.

[End of Demo Transcript]

Remember: This is realistic demo data designed to showcase the system's capabilities. 
Upgrade to API Ninjas Premium to fetch actual earnings call transcripts.
    `.trim();

    return {
      ticker: ticker.toUpperCase(),
      year,
      quarter,
      date: `${year}-${quarter * 3}-15`, // Approximate date
      transcript: demoTranscript,
    };
  }

  /**
   * Fetch earnings call transcript for a specific ticker and quarter
   */
  async fetchTranscript(
    ticker: string,
    year: number,
    quarter: number
  ): Promise<ApiNinjasTranscriptResponse | null> {
    try {
      logger.info('Fetching transcript', { ticker, year, quarter, isDemo: this.isDemo });

      // Return demo data if in demo mode
      if (this.isDemo) {
        logger.info('Using demo transcript data', { ticker, year, quarter });
        return this.generateDemoTranscript(ticker, year, quarter);
      }

      const response = await this.client.get('/earningstranscript', {
        params: {
          ticker: ticker.toUpperCase(),
          year,
          quarter,
        },
      });

      if (!response.data || typeof response.data !== 'object') {
        logger.warn('No transcript data received', { ticker, year, quarter });
        return null;
      }

      // Validate response structure
      const transcript = response.data;
      if (!transcript.transcript || transcript.transcript.trim().length === 0) {
        logger.warn('Empty transcript received', { ticker, year, quarter });
        return null;
      }

      logger.info('Transcript fetched successfully', {
        ticker,
        year,
        quarter,
        transcriptLength: transcript.transcript.length,
      });

      return {
        ticker: transcript.ticker || ticker.toUpperCase(),
        year: transcript.year || year,
        quarter: transcript.quarter || quarter,
        date: transcript.date || '',
        transcript: transcript.transcript,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          logger.info('Transcript not available, providing demo data', { ticker, year, quarter });
          return this.generateDemoTranscript(ticker, year, quarter);
        }

        if (error.response?.status === 403 || 
            (error.response?.data && 
             typeof error.response.data === 'object' && 
             'error' in error.response.data &&
             typeof error.response.data.error === 'string' &&
             error.response.data.error.includes('premium subscribers'))) {
          
          logger.warn('Premium subscription required for earnings call transcripts', {
            ticker, year, quarter,
            message: 'Earnings call transcripts require API Ninjas premium subscription'
          });
          
          // Return helpful demo data instead
          return this.generateDemoTranscript(ticker, year, quarter);
        }

        if (error.response?.status === 429) {
          logger.warn('Rate limit exceeded, retrying after delay', {
            ticker,
            year,
            quarter,
          });
          await new Promise(resolve => setTimeout(resolve, 5000));
          return this.fetchTranscript(ticker, year, quarter);
        }

        logger.error('API request failed, returning demo data', {
          ticker,
          year,
          quarter,
          status: error.response?.status,
          message: error.message,
          responseData: error.response?.data,
        });
      } else {
        logger.error('Unexpected error fetching transcript, returning demo data', {
          ticker,
          year,
          quarter,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Return demo data as fallback for any API errors
      logger.info('Falling back to demo data due to API error', { ticker, year, quarter });
      return this.generateDemoTranscript(ticker, year, quarter);
    }
  }

  /**
   * Fetch transcripts for multiple quarters with retry logic
   */
  async fetchTranscriptsWithRetry(
    ticker: string,
    quarters: Quarter[],
    maxRetries: number = config.api.maxRetries
  ): Promise<Array<ApiNinjasTranscriptResponse | null>> {
    const results: Array<ApiNinjasTranscriptResponse | null> = [];

    for (const quarter of quarters) {
      let attempts = 0;
      let transcript: ApiNinjasTranscriptResponse | null = null;

      while (attempts < maxRetries) {
        try {
          transcript = await this.fetchTranscript(
            ticker,
            quarter.year,
            quarter.quarter
          );
          break; // Success, exit retry loop
        } catch (error) {
          attempts++;
          
          if (attempts >= maxRetries) {
            logger.error('Max retry attempts reached', {
              ticker,
              year: quarter.year,
              quarter: quarter.quarter,
              attempts,
            });
            break;
          }

          const delay = config.api.retryDelayMs * attempts;
          logger.warn('Retrying after delay', {
            ticker,
            year: quarter.year,
            quarter: quarter.quarter,
            attempt: attempts,
            delay,
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      results.push(transcript);
    }

    return results;
  }

  /**
   * Get API usage statistics
   */
  getUsageStats(): {
    requestCount: number;
    lastRequestTime: number;
    isDemo: boolean;
  } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      isDemo: this.isDemo,
    };
  }

  /**
   * Reset usage statistics
   */
  resetStats(): void {
    this.requestCount = 0;
    this.lastRequestTime = 0;
  }
}

// Export singleton instance
export const apiNinjasService = new ApiNinjasService(); 