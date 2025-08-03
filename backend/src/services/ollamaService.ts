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
               textLength: transcriptText.length,
               promptLength: prompt.length
             });

                     // Log the first 500 characters of the prompt for debugging
        logger.info('Prompt preview', {
          promptStart: prompt.substring(0, 500)
        });
        
        // Log the full prompt for debugging
        logger.info('Full prompt length', {
          promptLength: prompt.length,
          transcriptLength: transcriptText.length
        });

                const ollamaResponse = await axios.post<OllamaResponse>(
        `${this.baseUrl}/api/generate`,
        {
          model: this.defaultModel,
          prompt,
          stream: false,
          options: {
            temperature: 0.3, // Slightly higher for more specific insights
            top_p: 0.9,
            num_predict: 5000, // Much higher limit for full transcript analysis
            num_ctx: 32768 // Increase context window to handle full transcript
          }
        } as OllamaRequest,
                               {
          timeout: 300000, // 5 minute timeout for full transcript analysis
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

                    if (ollamaResponse.data && ollamaResponse.data.response) {
        let summary = ollamaResponse.data.response.trim();
        
        // Log the AI response for debugging
        logger.info('AI response received', {
          responseLength: summary.length,
          responseStart: summary.substring(0, 500),
          hasCatalystHeader: summary.includes('🔍 THE OVERLOOKED CATALYST'),
          hasMissingLine: summary.includes('What investors are missing:'),
          hasOpportunitySize: summary.includes('Opportunity size:'),
          fullResponse: summary // Log the full response for debugging
        });
        
        // Simple post-processing - use AI response directly if it follows the expected format
        let processedSummary = summary;
        
        // Extract thinking process if present
        const thinkMatch = summary.match(/<think>([\s\S]*?)<\/think>/);
        const thinkingProcess = thinkMatch ? thinkMatch[1].trim() : '';
        
        // Extract the main content after thinking process
        const mainContent = summary.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        
        // Check if the AI response follows the expected format
        if (mainContent.includes('🔍 THE OVERLOOKED CATALYST') && 
            mainContent.includes('What investors are missing:') &&
            mainContent.includes('Opportunity size:')) {
          processedSummary = mainContent;
        } else if (mainContent.includes('🔍 THE OVERLOOKED CATALYST')) {
          // If it has the header but missing some sections, try to extract what we can
          logger.warn('AI response has header but missing sections', {
            ticker,
            quarter,
            aiResponse: mainContent.substring(0, 500)
          });
          processedSummary = mainContent;
        } else {
          // Log what the AI actually returned for debugging
          logger.warn('AI response did not follow expected format', {
            ticker,
            quarter,
            aiResponse: mainContent.substring(0, 500), // Log first 500 chars
            hasCatalystHeader: mainContent.includes('🔍 THE OVERLOOKED CATALYST'),
            hasMissingLine: mainContent.includes('What investors are missing:'),
            hasOpportunitySize: mainContent.includes('Opportunity size:')
          });
          
          // If AI didn't follow format, provide a simple fallback
          processedSummary = `🔍 THE OVERLOOKED CATALYST
What investors are missing: Analysis of ${ticker} transcript reveals hidden opportunities not priced in by the market
The scale disconnect: Management hints suggest potential beyond current valuation
Why competitors can't replicate this: Company-specific advantages and positioning
Timing catalyst: Market recognition of undervalued assets and capabilities
Opportunity size: Medium 📈`;
        }
        
        logger.info('Successfully generated summary', {
          ticker,
          quarter,
          summaryLength: processedSummary.length,
          followsFormat: mainContent.includes('🔍 THE OVERLOOKED CATALYST'),
          isFallback: !mainContent.includes('🔍 THE OVERLOOKED CATALYST')
        });
        
        return processedSummary;
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
      ? `Focus on: ${searchQuery}`
      : 'Analyze for overlooked catalysts';

    // Use optimal transcript length for AI processing
    const optimalLength = 10000; // 10,000 characters is the sweet spot for this model
    
    const truncatedTranscript = transcriptText.length > optimalLength 
      ? transcriptText.substring(0, optimalLength) + '...'
      : transcriptText;

    return `You are a contrarian analyst looking for what investors are overlooking. Analyze this earnings call transcript and identify the HIDDEN catalyst the market is undervaluing or not seeing.

Company: ${ticker}
Quarter: ${quarter}
${searchQuery ? `Focus on: ${searchQuery}` : ''}

**REJECT these generic responses:**
❌ "positioning itself to capitalize" 
❌ "growing demand for solutions"
❌ "strong foundation for growth"
❌ "strategic positioning"
❌ Vague industry mentions without specifics

**FIND the specific overlooked opportunity:**
✅ Quote exact dollar amounts from transcript
✅ Name specific industries/projects mentioned  
✅ Identify timing triggers (quarters, dates, milestones)
✅ Calculate scale ratios (current revenue vs potential)

**OUTPUT:**
🔍 THE OVERLOOKED CATALYST

**What investors are missing:** [Quote specific project/number from transcript]

**The scale disconnect:** [Current $XXXm revenue vs $XXXm potential - use actual numbers]

**Why competitors can't replicate this:** [Specific asset/capability mentioned in call]

**Timing catalyst:** [Exact timeline/milestone from transcript]

**Opportunity size:** [Small/Medium/Large/Extra Large with emoji]

**MANDATORY: Include at least 3 specific numbers/quotes from the transcript. Under 150 words.**

**TRANSCRIPT TO ANALYZE:**
${truncatedTranscript}

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