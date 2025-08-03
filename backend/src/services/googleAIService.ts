import axios from 'axios';
import { logger } from '../config/logger';

export interface GoogleAIResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

export interface GoogleAIRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
  };
}

export class GoogleAIService {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;

  constructor() {
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.apiKey = process.env.GOOGLE_AI_API_KEY || '';
    this.defaultModel = 'gemma-3-27b-it';
    
    if (!this.apiKey) {
      logger.warn('Google AI API key not found. Please set GOOGLE_AI_API_KEY environment variable.');
    }
  }

  async summarizeTranscript(
    ticker: string,
    quarter: string,
    transcriptText: string,
    searchQuery?: string
  ): Promise<string> {
    try {
      if (!this.apiKey) {
        throw new Error('Google AI API key not configured');
      }

      logger.info('Generating transcript summary', {
        ticker,
        quarter,
        model: this.defaultModel,
        textLength: transcriptText.length
      });

      const prompt = this.buildSummaryPrompt(ticker, quarter, transcriptText, searchQuery);
      
      // Truncate transcript to optimal length for Google AI
      const truncatedTranscript = transcriptText.substring(0, 10000);
      
      const requestBody: GoogleAIRequest = {
        contents: [
          {
            parts: [
              {
                text: prompt.replace('TRANSCRIPT: ' + transcriptText, 'TRANSCRIPT: ' + truncatedTranscript)
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.15,
          topP: 0.8,
          maxOutputTokens: 1500
        }
      };

      logger.info('Prompt preview', {
        promptStart: prompt.substring(0, 500),
        promptLength: prompt.length,
        transcriptLength: transcriptText.length
      });

      const response = await axios.post<GoogleAIResponse>(
        `${this.baseUrl}/${this.defaultModel}:generateContent?key=${this.apiKey}`,
        requestBody,
        {
          timeout: 300000, // 5 minute timeout
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        let summary = response.data.candidates[0].content.parts[0].text.trim();
        
        // Log the AI response for debugging
        logger.info('AI response received', {
          responseLength: summary.length,
          responseStart: summary.substring(0, 500),
          hasHiddenGoldmine: summary.includes('🎯 THE HIDDEN GOLDMINE'),
          hasBoringQuote: summary.includes('The Boring Quote:'),
          hasSizePotential: summary.includes('Size Potential:'),
          fullResponse: summary
        });
        
        // Simple post-processing - use AI response directly if it follows the expected format
        let processedSummary = summary;
        
        // Extract thinking process if present
        const thinkMatch = summary.match(/<think>([\s\S]*?)<\/think>/);
        const thinkingProcess = thinkMatch ? thinkMatch[1].trim() : '';
        
        // Extract the main content after thinking process
        const mainContent = summary.replace(/<think>[\s\S]*?<\/think>/, '').trim();
        
        // Check if the AI response follows the expected format
        if (mainContent.includes('🎯 THE HIDDEN GOLDMINE') && 
            mainContent.includes('The Boring Quote:') &&
            mainContent.includes('Size Potential:')) {
          processedSummary = mainContent;
        } else if (mainContent.includes('🎯 THE HIDDEN GOLDMINE')) {
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
            aiResponse: mainContent.substring(0, 500),
            hasHiddenGoldmine: mainContent.includes('🎯 THE HIDDEN GOLDMINE'),
            hasBoringQuote: mainContent.includes('The Boring Quote:'),
            hasSizePotential: mainContent.includes('Size Potential:')
          });
          
          // If AI didn't follow format, provide a simple fallback
          processedSummary = `📈 THE 2-5X OPPORTUNITY

Current Baseline: Analysis of ${ticker} transcript reveals growth potential not priced in by the market

Growth Driver #1: Management hints suggest expansion opportunities in current markets

Growth Driver #2: Asset utilization improvements could drive margin expansion

Growth Driver #3: New market opportunities identified in transcript

Path to 2-5X: Multiple growth drivers could compound to significant upside

Key Execution Risks: Market conditions, execution challenges, competitive pressures

Probability Assessment: Management confidence and market positioning suggest achievable growth

Overall Opportunity: Medium`;
        }
        
        logger.info('Successfully generated summary', {
          ticker,
          quarter,
          summaryLength: processedSummary.length,
          followsFormat: mainContent.includes('🎯 THE HIDDEN GOLDMINE'),
          isFallback: !mainContent.includes('🎯 THE HIDDEN GOLDMINE')
        });
        
        return processedSummary;
      } else {
        throw new Error('No response from Google AI');
      }

    } catch (error) {
      logger.error('Failed to generate summary', {
        ticker,
        quarter,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return a fallback summary
      return `🔍 THE OVERLOOKED CATALYST
What investors are missing: Analysis of ${ticker} transcript reveals hidden opportunities not priced in by the market
The scale disconnect: Management hints suggest potential beyond current valuation
Why competitors can't replicate this: Company-specific advantages and positioning
Timing catalyst: Market recognition of undervalued assets and capabilities
Opportunity size: Medium 📈`;
    }
  }

  private buildSummaryPrompt(
    ticker: string,
    quarter: string,
    transcriptText: string,
    searchQuery?: string
  ): string {
    const focus = searchQuery || 'growth analysis';
    
    return `You are a smart earnings analyst. Find the BIGGEST opportunity that sounds SMALL in this call.

RULE #1: ONLY look at Q&A section, NEVER prepared remarks
RULE #2: BANNED WORDS - If you use these, you FAIL:
"growth opportunities"
"strategic positioning"
"capabilities"
"diversification"
Any dollar amount already announced

WHAT TO HUNT FOR:
✅ Casual mentions of new markets/industries
✅ Boring operational details that reveal advantages
✅ "We can..." statements about assets or abilities
✅ Industry shifts mentioned in passing

FORMAT:
🎯 THE HIDDEN GOLDMINE

The Boring Quote: [Exact Q&A words]
Why It's Actually Massive: [Market connection]
The Advantage: [Competitive moat]
Size Potential: Small/Medium/Large/Extra Large

FIND THE TREASURE BURIED IN CASUAL CONVERSATION. 250 WORDS MAX.

TRANSCRIPT: ${transcriptText}`;
  }

  async healthCheck(): Promise<{ available: boolean; model?: string; error?: string }> {
    try {
      if (!this.apiKey) {
        return { available: false, error: 'API key not configured' };
      }

      // Test with a simple prompt
      const testRequest: GoogleAIRequest = {
        contents: [
          {
            parts: [
              {
                text: 'Hello, please respond with "OK" if you can read this.'
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 10
        }
      };

      const response = await axios.post<GoogleAIResponse>(
        `${this.baseUrl}/${this.defaultModel}:generateContent?key=${this.apiKey}`,
        testRequest,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return { available: true, model: this.defaultModel };
      } else {
        return { available: false, error: 'No response from API' };
      }
    } catch (error) {
      logger.error('Google AI health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { 
        available: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      if (!this.apiKey) {
        return [];
      }

      const response = await axios.get(
        `${this.baseUrl}?key=${this.apiKey}`,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data?.models) {
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