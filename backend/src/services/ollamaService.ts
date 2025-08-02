import axios from 'axios';
import { logger } from '@/config/logger';

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export interface OllamaRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}

export class OllamaService {
  private baseUrl: string;
  private defaultModel: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.defaultModel = process.env.OLLAMA_MODEL || 'deepseek-r1:latest';
  }

  /**
   * Generate a summary of transcript content
   */
  async summarizeTranscript(
    ticker: string,
    quarter: string,
    transcriptText: string,
    searchQuery?: string
  ): Promise<string> {
    try {
      const prompt = this.buildSummaryPrompt(ticker, quarter, transcriptText, searchQuery);
      
      logger.info('Generating transcript summary', {
        ticker,
        quarter,
        model: this.defaultModel,
        textLength: transcriptText.length
      });

      const response = await axios.post<OllamaResponse>(
        `${this.baseUrl}/api/generate`,
        {
          model: this.defaultModel,
          prompt,
          stream: false,
          options: {
            temperature: 0.3, // Lower temperature for more focused summaries
            top_p: 0.9,
            num_predict: 500 // Limit response length
          }
        } as OllamaRequest,
        {
          timeout: 60000, // 60 second timeout
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.response) {
        logger.info('Successfully generated summary', {
          ticker,
          quarter,
          summaryLength: response.data.response.length
        });
        
        return response.data.response.trim();
      } else {
        throw new Error('No response from Ollama');
      }

    } catch (error) {
      logger.error('Failed to generate summary', {
        ticker,
        quarter,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build a prompt for transcript summarization
   */
  private buildSummaryPrompt(
    ticker: string,
    quarter: string,
    transcriptText: string,
    searchQuery?: string
  ): string {
    const context = searchQuery 
      ? `Focus on information related to: "${searchQuery}"`
      : 'Provide a comprehensive summary of the key points discussed';

    return `You are a financial analyst summarizing an earnings call transcript.

Company: ${ticker}
Quarter: ${quarter}
${searchQuery ? `Search Context: ${searchQuery}` : ''}

Please provide a concise, professional summary of this earnings call transcript. ${context}

Focus on:
- Key financial metrics and performance highlights
- Strategic initiatives and business updates
- Management's outlook and guidance
- Important announcements or changes
- Risk factors or challenges mentioned

Keep the summary clear, factual, and business-focused. Use bullet points for key highlights.

TRANSCRIPT:
${transcriptText.substring(0, 4000)}${transcriptText.length > 4000 ? '...' : ''}

SUMMARY:`;
  }

  /**
   * Check if Ollama is available and responding
   */
  async healthCheck(): Promise<{ available: boolean; model?: string; error?: string }> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000
      });
      
      if (response.data && response.data.models) {
        const hasModel = response.data.models.some((model: any) => 
          model.name === this.defaultModel
        );
        
        return {
          available: hasModel,
          model: hasModel ? this.defaultModel : undefined,
          error: hasModel ? undefined : `Model ${this.defaultModel} not found`
        };
      }
      
      return { available: false, error: 'Invalid response from Ollama' };
      
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000
      });
      
      if (response.data && response.data.models) {
        return response.data.models.map((model: any) => model.name);
      }
      
      return [];
      
    } catch (error) {
      logger.error('Failed to get available models', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }
}

// Export singleton instance
export const ollamaService = new OllamaService(); 