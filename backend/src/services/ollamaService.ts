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
            num_predict: 2000 // Much higher limit for complete structured responses
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
        let summary = response.data.response.trim();
        
        // Post-process to ensure we have all required sections
        const requiredSections = [
          '## Key Financial Highlights',
          '## Strategic Initiatives',
          '## Management Outlook',
          '## 🎯 POSITIVE OUTLIERS & SURPRISES',
          '## Risk Factors'
        ];
        
        // Check if all sections are present
        const missingSections = requiredSections.filter(section => !summary.includes(section));
        
        if (missingSections.length > 0) {
          logger.warn('Summary missing required sections', {
            ticker,
            quarter,
            missingSections,
            summaryLength: summary.length
          });
          
          // Add missing sections with placeholder content
          missingSections.forEach(section => {
            if (section === '## Risk Factors') {
              summary += '\n\n## Risk Factors\n- No specific risks mentioned in the transcript';
            } else if (section === '## 🎯 POSITIVE OUTLIERS & SURPRISES') {
              summary += '\n\n## 🎯 POSITIVE OUTLIERS & SURPRISES\n- No specific positive outliers identified';
            } else {
              summary += `\n\n${section}\n- Information not available in transcript`;
            }
          });
        }
        
        logger.info('Successfully generated summary', {
          ticker,
          quarter,
          summaryLength: summary.length,
          missingSections: missingSections.length
        });
        
        return summary;
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

    return `You are a financial analyst. Analyze the following earnings call transcript and create a structured summary.

Company: ${ticker}
Quarter: ${quarter}
${searchQuery ? `Focus on: ${searchQuery}` : ''}

**CRITICAL: You MUST analyze the ACTUAL transcript below and follow this EXACT format:**

<think>
[Explain your analysis process and what you found in the transcript]
</think>

## Key Financial Highlights
- [Extract 3-4 specific financial metrics from the transcript]

## Strategic Initiatives  
- [List 2-3 strategic moves mentioned in the transcript]

## Management Outlook
- [List 2-3 forward-looking statements from the transcript]

## 🎯 POSITIVE OUTLIERS & SURPRISES
- [List unexpected positive developments that beat expectations]

## Risk Factors
- [List 2-3 risks or challenges mentioned]

**REQUIREMENTS:**
- Use EXACT section headers above
- Use bullet points (- ) for all items
- Extract SPECIFIC information from the transcript
- Be concrete with numbers and details
- Do NOT make up information not in the transcript
- IMPORTANT: After your <think> section, you MUST extract the actual information you found into the structured sections above

**TRANSCRIPT TO ANALYZE:**
${transcriptText.substring(0, 4000)}${transcriptText.length > 4000 ? '...' : ''}

**YOUR ANALYSIS:**`;
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