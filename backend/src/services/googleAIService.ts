import axios from 'axios';
import { logger } from '../config/logger';
import { prisma } from '../config/database';
import { AISummaryData } from '../types';

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

export interface MultipleAIResponse {
  id: number;
  timestamp: string;
  content: string;
  processingTime: number;
  hasHiddenGoldmine: boolean;
  hasBoringQuote: boolean;
  hasSizePotential: boolean;
  analystType: string;
}

export interface MultipleAIResponses {
  responses: MultipleAIResponse[];
  totalProcessingTime: number;
  averageProcessingTime: number;
  successCount: number;
  failureCount: number;
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

  // Helper function to add delay between API calls
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper function to generate unique random seed
  private generateRandomSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper function to make a single AI call
  private async makeAICall(
    basePrompt: string,
    responseId: number,
    temperature: number = 0.15
  ): Promise<MultipleAIResponse> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const randomSeed = this.generateRandomSeed();
    
    // Create 4 completely different analyst personas for maximum diversity
    const prompts = [
      // Prompt 1: Claude - Deep Value Investor
      `Analyze this earnings call transcript as a deep-value investor looking for underappreciated catalysts. Extract ONE hidden insight that could significantly change the business trajectory.

What to Look For:
Business model transformations: Shifts from low-margin to high-margin activities, recurring revenue changes, customer acquisition improvements
Margin expansion catalysts: Cost structure changes, pricing power improvements, operational leverage inflection points
Competitive positioning shifts: Market share gains, customer switching dynamics, competitive moat strengthening
Portfolio optimization: Cross-selling opportunities, customer base monetization, asset utilization improvements
Management conviction signals: Emotional language, confident predictions, "game-changer" type statements

Enhanced Analysis Framework:
Follow the money trail: Look for revenue/margin mix changes, customer lifetime value improvements, cost structure shifts
Spot scattered data points: Numbers mentioned casually that have big implications when connected
Read between the lines: Management tone, confidence levels, strategic emphasis shifts
Find operational inflection points: Capacity utilization, automation benefits, process improvements scaling
Identify customer behavior changes: Switching patterns, adoption rates, usage increases
Look for flywheel effects: Where one improvement enables multiple other improvements

Red Flags for True Hidden Insights:
✓ Mentioned briefly but not emphasized in headlines
✓ Requires connecting multiple data points from different parts of call
✓ Management shows unusual confidence/excitement about specific initiative
✓ Represents fundamental shift in how business operates or competes
✓ Has compounding/recurring benefits over time
✓ Difficult for competitors to quickly replicate

Output Format:
Hidden Insight: [One sentence describing the key insight]
Why It's Hidden: [Specifically why analysts miss this - buried in details, requires connecting dots, understated by management, etc.]
Business Impact: [Quantify the trajectory change - revenue growth acceleration, margin expansion, market share capture, competitive advantage, etc.]
Supporting Evidence: [2-3 specific data points or quotes from transcript that support this insight]
Bullish Rating: [SMALL/MEDIUM/LARGE/EXTRA LARGE/HUGE]
SMALL: 5-15% potential impact on business value
MEDIUM: 15-30% potential impact
LARGE: 30-60% potential impact
EXTRA LARGE: 60-100% potential impact
HUGE: 100%+ potential impact
Confidence Level: [HIGH/MEDIUM/LOW] based on management specificity, early results, and execution feasibility
Time Horizon: [6-12 months/1-2 years/2-5 years]
Catalyst Type: [Business Model Evolution/Operational Leverage/Market Expansion/Competitive Moat/Portfolio Optimization/Other]

Focus on insights that represent fundamental shifts in business economics, not just quarterly performance variations.
less than 300 words

TRANSCRIPT: ${basePrompt.split('TRANSCRIPT: ')[1]}`,
      
      // Prompt 2: Gemini - Skeptical Investment Analyst
      `Act as a seasoned, skeptical, and forward-looking investment analyst specializing in identifying under-the-radar catalysts. Your task is to analyze the provided earnings call transcript to uncover a single, non-obvious "hidden insight" that suggests a potential positive and fundamental change in the company's business trajectory.

What Constitutes a 'Hidden Insight':
It is NOT the main headline: Disregard the top-line revenue/EPS figures and stated guidance unless they are direct evidence for the deeper insight.
It connects disparate points: The insight often links a statement from the prepared remarks with a more detailed, unscripted answer in the Q&A section.
It reveals a "Trojan Horse": The insight might identify a small product, acquisition, or partnership that is not yet material to revenue but provides a strategic entry point into a much larger market or ecosystem.
It spots a subtle shift in language: Look for changes in management's tone or wording from previous quarters (e.g., from "exploring" to "implementing," from "hope" to "expect," or a sudden increase in specificity).
It uncovers a second-order effect: The direct action is known (e.g., a customer win), but the hidden insight is the unforeseen positive consequence (e.g., that new customer is now marketing your product to its own partners, creating a free sales channel).
It identifies a new capability unlock: The company may have acquired or developed a capability (e.g., a specific type of manufacturing, a unique software) that solves a critical bottleneck for an entire industry, a fact that may be buried in technical jargon.

Instructions:
Read the entire transcript below.
Identify the single most powerful "hidden insight" based on the criteria above.
Structure your response in the following format ONLY:
Hidden Insight: (A single, concise sentence summarizing the finding).
Evidence & Reasoning: (Using 2-4 bullet points, provide direct evidence from the transcript, citing source numbers like. Explain why this insight is non-obvious and how the pieces of evidence connect to reveal a trajectory-changing potential that analysts might miss).
Bullishness Score: (Classify the potential impact of this insight on the business trajectory. Choose one: Small, Medium, Large, Extra Large, Huge).
Confidence Level: (Based on the evidence, rate your confidence in this insight materializing. Choose one: High, Medium, Low).
less than 300 words

TRANSCRIPT: ${basePrompt.split('TRANSCRIPT: ')[1]}`,
      
      // Prompt 3: DeepSeek - Strategic Insight Analyst
      `Analyze the earnings transcript and identify ONE non-obvious strategic insight that meets ALL criteria:
1. Buried in management commentary (not headline numbers/guidance)
2. Indicates potential for exponential growth/margin expansion
3. Currently underappreciated by analysts
4. Could materially alter business trajectory if executed well

Output JSON format:
{
"insight": "[concise description with supporting quote]",
"impact_driver": "[revenue growth|market share|margin expansion|competitive moat]",
"evidence": "[specific transcript excerpt with timestamp]",
"bullish_scale": "[small|medium|large|extra large|huge]",
"reasoning": "[1-sentence why this changes trajectory]"
}

less than 300 words

TRANSCRIPT: ${basePrompt.split('TRANSCRIPT: ')[1]}`,
      
      // Prompt 4: Grok - Expert Industry Analyst
      `You are an expert investor with deep knowledge across industries. Analyze the provided earnings call transcript deeply, considering executive remarks, Q&A, forward-looking statements, and subtle implications. Focus on identifying ONE hidden insight that might be overlooked by most analysts (e.g., buried in casual mentions, contradictions, or indirect signals). This insight must be positive and likely to significantly change the business trajectory for the better (e.g., unlocking new growth, efficiencies, or competitive edges).

Explain the insight briefly (2-4 sentences), including why it's hidden and its potential impact.
Rate its bullish potential on this scale: small (minor positive tweak), medium (notable improvement), large (strong growth driver), extra large (major revenue/market shift), huge (transformative for the company/industry). Base the rating on realism, evidence in the transcript, and long-term implications.
less than 300 words

TRANSCRIPT: ${basePrompt.split('TRANSCRIPT: ')[1]}`
    ];
    
    const selectedPrompt = prompts[responseId - 1]; // Use different prompt for each response
    
    const analystTypes = ['Claude', 'Gemini', 'DeepSeek', 'Grok'];
    const currentAnalystType = analystTypes[responseId - 1];
    
    logger.info(`Making AI call ${responseId}/4`, {
      responseId,
      timestamp,
      randomSeed,
      temperature,
      promptType: currentAnalystType
    });

    const requestBody: GoogleAIRequest = {
      contents: [
        {
          parts: [
            {
              text: selectedPrompt + `\n\nRandom seed: ${randomSeed}\nTimestamp: ${timestamp}\nResponse ID: ${responseId}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.9,
        topP: 1.0,
        topK: 40,
        maxOutputTokens: 2048
      }
    };

    try {
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

      const processingTime = Date.now() - startTime;
      
      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const content = response.data.candidates[0].content.parts[0].text.trim();
        
        logger.info(`AI response ${responseId} received`, {
          responseId,
          processingTime,
          responseLength: content.length,
          responseStart: content.substring(0, 200)
        });

        return {
          id: responseId,
          timestamp,
          content,
          processingTime,
          hasHiddenGoldmine: content.includes('🎯 THE HIDDEN GOLDMINE'),
          hasBoringQuote: content.includes('The Boring Quote:'),
          hasSizePotential: content.includes('Size Potential:'),
          analystType: currentAnalystType
        };
      } else {
        throw new Error('No response content from Google AI');
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`AI call ${responseId} failed`, {
        responseId,
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }

  async generateMultipleSummaries(
    ticker: string,
    quarter: string,
    transcriptText: string,
    searchQuery?: string
  ): Promise<MultipleAIResponses> {
    try {
      if (!this.apiKey) {
        throw new Error('Google AI API key not configured');
      }

      logger.info('Generating 4 AI summaries with unique model creators', {
        ticker,
        quarter,
        model: this.defaultModel,
        textLength: transcriptText.length,
        searchQuery
      });

      const truncatedTranscript = transcriptText.substring(0, 10000);
      const responses: MultipleAIResponse[] = [];
      const startTime = Date.now();
      let successCount = 0;
      let failureCount = 0;

      // Use our 4 different prompts with unique model creators
      const prompts = [
        // Claude - Deep Value Investor
        `Analyze this earnings call transcript as a deep-value investor looking for underappreciated catalysts. Extract ONE hidden insight that could significantly change the business trajectory.

What to Look For:
Business model transformations: Shifts from low-margin to high-margin activities, recurring revenue changes, customer acquisition improvements
Margin expansion catalysts: Cost structure changes, pricing power improvements, operational leverage inflection points
Competitive positioning shifts: Market share gains, customer switching dynamics, competitive moat strengthening
Portfolio optimization: Cross-selling opportunities, customer base monetization, asset utilization improvements
Management conviction signals: Emotional language, confident predictions, "game-changer" type statements

Enhanced Analysis Framework:
Follow the money trail: Look for revenue/margin mix changes, customer lifetime value improvements, cost structure shifts
Spot scattered data points: Numbers mentioned casually that have big implications when connected
Read between the lines: Management tone, confidence levels, strategic emphasis shifts
Find operational inflection points: Capacity utilization, automation benefits, process improvements scaling
Identify customer behavior changes: Switching patterns, adoption rates, usage increases
Look for flywheel effects: Where one improvement enables multiple other improvements

Red Flags for True Hidden Insights:
✓ Mentioned briefly but not emphasized in headlines
✓ Requires connecting multiple data points from different parts of call
✓ Management shows unusual confidence/excitement about specific initiative
✓ Represents fundamental shift in how business operates or competes
✓ Has compounding/recurring benefits over time
✓ Difficult for competitors to quickly replicate

Output Format:
Hidden Insight: [One sentence describing the key insight]
Why It's Hidden: [Specifically why analysts miss this - buried in details, requires connecting dots, understated by management, etc.]
Business Impact: [Quantify the trajectory change - revenue growth acceleration, margin expansion, market share capture, competitive advantage, etc.]
Supporting Evidence: [2-3 specific data points or quotes from transcript that support this insight]
Bullish Rating: [SMALL/MEDIUM/LARGE/EXTRA LARGE/HUGE]
SMALL: 5-15% potential impact on business value
MEDIUM: 15-30% potential impact
LARGE: 30-60% potential impact
EXTRA LARGE: 60-100% potential impact
HUGE: 100%+ potential impact
Confidence Level: [HIGH/MEDIUM/LOW] based on management specificity, early results, and execution feasibility
Time Horizon: [6-12 months/1-2 years/2-5 years]
Catalyst Type: [Business Model Evolution/Operational Leverage/Market Expansion/Competitive Moat/Portfolio Optimization/Other]

Focus on insights that represent fundamental shifts in business economics, not just quarterly performance variations.
less than 300 words

TRANSCRIPT: ${truncatedTranscript}`,

        // Gemini - Skeptical Investment Analyst
        `Act as a seasoned, skeptical, and forward-looking investment analyst specializing in identifying under-the-radar catalysts. Your task is to analyze the provided earnings call transcript to uncover a single, non-obvious "hidden insight" that suggests a potential positive and fundamental change in the company's business trajectory.

What Constitutes a 'Hidden Insight':
It is NOT the main headline: Disregard the top-line revenue/EPS figures and stated guidance unless they are direct evidence for the deeper insight.
It connects disparate points: The insight often links a statement from the prepared remarks with a more detailed, unscripted answer in the Q&A section.
It reveals a "Trojan Horse": The insight might identify a small product, acquisition, or partnership that is not yet material to revenue but provides a strategic entry point into a much larger market or ecosystem.
It spots a subtle shift in language: Look for changes in management's tone or wording from previous quarters (e.g., from "exploring" to "implementing," from "hope" to "expect," or a sudden increase in specificity).
It uncovers a second-order effect: The direct action is known (e.g., a customer win), but the hidden insight is the unforeseen positive consequence (e.g., that new customer is now marketing your product to its own partners, creating a free sales channel).
It identifies a new capability unlock: The company may have acquired or developed a capability (e.g., a specific type of manufacturing, a unique software) that solves a critical bottleneck for an entire industry, a fact that may be buried in technical jargon.

Instructions:
Read the entire transcript below.
Identify the single most powerful "hidden insight" based on the criteria above.
Structure your response in the following format ONLY:
Hidden Insight: (A single, concise sentence summarizing the finding).
Evidence & Reasoning: (Using 2-4 bullet points, provide direct evidence from the transcript, citing source numbers like. Explain why this insight is non-obvious and how the pieces of evidence connect to reveal a trajectory-changing potential that analysts might miss).
Bullishness Score: (Classify the potential impact of this insight on the business trajectory. Choose one: Small, Medium, Large, Extra Large, Huge).
Confidence Level: (Based on the evidence, rate your confidence in this insight materializing. Choose one: High, Medium, Low).
less than 300 words

TRANSCRIPT: ${truncatedTranscript}`,

        // DeepSeek - Strategic Insight Analyst
        `Analyze the earnings transcript and identify ONE non-obvious strategic insight that meets ALL criteria:
1. Buried in management commentary (not headline numbers/guidance)
2. Indicates potential for exponential growth/margin expansion
3. Currently underappreciated by analysts
4. Could materially alter business trajectory if executed well

Output JSON format:
{
"insight": "[concise description with supporting quote]",
"impact_driver": "[revenue growth|market share|margin expansion|competitive moat]",
"evidence": "[specific transcript excerpt with timestamp]",
"bullish_scale": "[small|medium|large|extra large|huge]",
"reasoning": "[1-sentence why this changes trajectory]"
}

less than 300 words

TRANSCRIPT: ${truncatedTranscript}`,

        // Grok - Expert Industry Analyst
        `You are an expert investor with deep knowledge across industries. Analyze the provided earnings call transcript deeply, considering executive remarks, Q&A, forward-looking statements, and subtle implications. Focus on identifying ONE hidden insight that might be overlooked by most analysts (e.g., buried in casual mentions, contradictions, or indirect signals). This insight must be positive and likely to significantly change the business trajectory for the better (e.g., unlocking new growth, efficiencies, or competitive edges).

Explain the insight briefly (2-4 sentences), including why it's hidden and its potential impact.
Rate its bullish potential on this scale: small (minor positive tweak), medium (notable improvement), large (strong growth driver), extra large (major revenue/market shift), huge (transformative for the company/industry). Base the rating on realism, evidence in the transcript, and long-term implications.
less than 300 words

TRANSCRIPT: ${truncatedTranscript}`
      ];

      const analystTypes = ['Claude', 'Gemini', 'DeepSeek', 'Grok'];

      // Generate all 4 AI summaries
      for (let i = 0; i < 4; i++) {
        try {
          if (i > 0) {
            await this.delay(1000); // Rate limiting between calls
          }

          const response = await this.makeAICall(prompts[i], i + 1, 0.9);
          responses.push(response);
          successCount++;
          
          logger.info(`AI summary ${i + 1}/4 completed (${analystTypes[i]})`, { responseId: i + 1 });
        } catch (error) {
          failureCount++;
          logger.error(`AI summary ${i + 1}/4 failed (${analystTypes[i]})`, { 
            responseId: i + 1, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          responses.push(this.createFallbackResponse(i + 1, ticker, analystTypes[i]));
        }
      }

      const totalProcessingTime = Date.now() - startTime;
      const averageProcessingTime = totalProcessingTime / responses.length;

      const result: MultipleAIResponses = {
        responses: responses.slice(0, 4), // Ensure exactly 4 responses
        totalProcessingTime,
        averageProcessingTime,
        successCount,
        failureCount
      };

      logger.info('4 AI summaries completed', {
        ticker,
        quarter,
        totalProcessingTime,
        averageProcessingTime,
        successCount,
        failureCount
      });

      return result;

    } catch (error) {
      logger.error('Failed to generate 4 AI summaries', {
        ticker,
        quarter,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }

  /**
   * Save AI summaries to database
   */
  async saveAISummariesToDatabase(
    transcriptId: string,
    responses: MultipleAIResponse[],
    searchQuery?: string
  ): Promise<AISummaryData[]> {
    try {
      const savedSummaries: AISummaryData[] = [];

      for (const response of responses) {
        const summary = await prisma.aISummary.upsert({
          where: {
            transcriptId_analystType: {
              transcriptId,
              analystType: response.analystType
            }
          },
          update: {
            content: response.content,
            processingTime: response.processingTime,
            hasHiddenGoldmine: response.hasHiddenGoldmine,
            hasBoringQuote: response.hasBoringQuote,
            hasSizePotential: response.hasSizePotential,
            searchQuery,
            updatedAt: new Date()
          },
          create: {
            transcriptId,
            analystType: response.analystType,
            content: response.content,
            processingTime: response.processingTime,
            hasHiddenGoldmine: response.hasHiddenGoldmine,
            hasBoringQuote: response.hasBoringQuote,
            hasSizePotential: response.hasSizePotential,
            searchQuery
          }
        });

        savedSummaries.push({
          id: summary.id,
          transcriptId: summary.transcriptId,
          analystType: summary.analystType,
          content: summary.content,
          processingTime: summary.processingTime,
          hasHiddenGoldmine: summary.hasHiddenGoldmine,
          hasBoringQuote: summary.hasBoringQuote,
          hasSizePotential: summary.hasSizePotential,
          searchQuery: summary.searchQuery,
          createdAt: summary.createdAt,
          updatedAt: summary.updatedAt
        });
      }

      logger.info('AI summaries saved to database', {
        transcriptId,
        summariesCount: savedSummaries.length,
        analystTypes: savedSummaries.map(s => s.analystType)
      });

      return savedSummaries;
    } catch (error) {
      logger.error('Failed to save AI summaries to database', {
        transcriptId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get AI summaries from database
   */
  async getAISummariesFromDatabase(transcriptId: string): Promise<AISummaryData[]> {
    try {
      const summaries = await prisma.aISummary.findMany({
        where: { transcriptId },
        orderBy: { analystType: 'asc' }
      });

      return summaries.map((summary: any) => ({
        id: summary.id,
        transcriptId: summary.transcriptId,
        analystType: summary.analystType,
        content: summary.content,
        processingTime: summary.processingTime,
        hasHiddenGoldmine: summary.hasHiddenGoldmine,
        hasBoringQuote: summary.hasBoringQuote,
        hasSizePotential: summary.hasSizePotential,
        searchQuery: summary.searchQuery,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt
      }));
    } catch (error) {
      logger.error('Failed to get AI summaries from database', {
        transcriptId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Helper method to parse assessment response
  private parseAssessmentResponse(assessmentResponse: string): string[] {
    const opportunityTypes: string[] = [];
    
    if (assessmentResponse.includes('TYPE 1:') || assessmentResponse.includes('OPERATIONAL EDGE')) {
      opportunityTypes.push('OPERATIONAL');
    }
    if (assessmentResponse.includes('TYPE 2:') || assessmentResponse.includes('MARKET ACCESS')) {
      opportunityTypes.push('MARKET_ACCESS');
    }
    if (assessmentResponse.includes('TYPE 3:') || assessmentResponse.includes('FINANCIAL LEVERAGE')) {
      opportunityTypes.push('FINANCIAL');
    }
    if (assessmentResponse.includes('TYPE 4:') || assessmentResponse.includes('ASSET ARBITRAGE')) {
      opportunityTypes.push('ASSET');
    }
    
    return opportunityTypes;
  }

  // Helper method to build deep dive prompts
  private buildDeepDivePrompt(opportunityType: string, transcript: string): string {
    const prompts = {
      'OPERATIONAL': `Find the hidden OPERATIONAL advantage in this transcript that creates competitive moat.

**FOCUS ON:**
✅ Speed/efficiency mentions in Q&A
✅ Cost structure advantages
✅ Process capabilities competitors lack
✅ Operational flexibility

**BANNED:** Any topic already analyzed

**FORMAT:**
⚡ **THE OPERATIONAL EDGE**
**The Operational Quote:** [Exact words]
**Why It's A Moat:** [Competitive advantage]
**Size Potential:** Small/Medium/Large/Extra Large

TRANSCRIPT: ${transcript}`,

      'MARKET_ACCESS': `Find the hidden MARKET ACCESS opportunity in this transcript.

**FOCUS ON:**
✅ Regulatory changes in Q&A
✅ Reimbursement improvements
✅ New market segments opening
✅ Customer access expanding

**BANNED:** Any topic already analyzed

**FORMAT:**
🚪 **THE ACCESS OPPORTUNITY**
**The Access Quote:** [Exact words]  
**Why It Opens Markets:** [Market expansion]
**Size Potential:** Small/Medium/Large/Extra Large

TRANSCRIPT: ${transcript}`,

      'FINANCIAL': `Find the hidden FINANCIAL STRUCTURE advantage in this transcript.

**FOCUS ON:**
✅ Balance sheet flexibility in Q&A
✅ Cash flow optimization
✅ Debt refinancing benefits
✅ Capital allocation advantages

**BANNED:** Any topic already analyzed

**FORMAT:**
💰 **THE FINANCIAL EDGE**
**The Financial Quote:** [Exact words]
**Why It's Powerful:** [Financial advantage]  
**Size Potential:** Small/Medium/Large/Extra Large

TRANSCRIPT: ${transcript}`,

      'ASSET': `Find the hidden ASSET ARBITRAGE opportunity in this transcript.

**FOCUS ON:**
✅ Undervalued asset mentions in Q&A
✅ Repurposing potential
✅ Hidden asset value
✅ Asset utilization improvements

**BANNED:** Any topic already analyzed

**FORMAT:**
🏭 **THE ASSET PLAY**
**The Asset Quote:** [Exact words]
**Why It's Undervalued:** [Arbitrage opportunity]
**Size Potential:** Small/Medium/Large/Extra Large

TRANSCRIPT: ${transcript}`
    };

    return prompts[opportunityType as keyof typeof prompts] || prompts['OPERATIONAL'];
  }

  // Helper method to create fallback responses
  private createFallbackResponse(id: number, ticker: string, type: string): MultipleAIResponse {
    const analystTypes = ['Claude', 'Gemini', 'DeepSeek', 'Grok'];
    const analystType = analystTypes[id - 1] || 'Additional Analysis';
    
    return {
      id,
      timestamp: new Date().toISOString(),
      content: `🔍 ${type.toUpperCase()} ANALYSIS (Fallback Response ${id})
What investors are missing: Analysis of ${ticker} transcript reveals hidden opportunities not priced in by the market
The scale disconnect: Management hints suggest potential beyond current valuation
Why competitors can't replicate this: Company-specific advantages and positioning
Timing catalyst: Market recognition of undervalued assets and capabilities
Opportunity size: Medium 📈

Note: This is a fallback response due to API call failure.`,
      processingTime: 0,
      hasHiddenGoldmine: false,
      hasBoringQuote: false,
      hasSizePotential: false,
      analystType
    };
  }

  // Helper method to extract key topics from AI response
  private extractKeyTopics(content: string): string[] {
    const topics: string[] = [];
    
    // Extract product names (capitalized words that might be products)
    const productMatches = content.match(/\b[A-Z]{2,}(?:[A-Z][a-z]+)*\b/g) || [];
    topics.push(...productMatches.slice(0, 3)); // Take first 3 potential products
    
    // Extract key phrases from "The Boring Quote" section
    const quoteMatch = content.match(/The Boring Quote:\s*"([^"]+)"/);
    if (quoteMatch) {
      const quote = quoteMatch[1];
      // Extract key terms from the quote
      const keyTerms = quote.match(/\b\w+(?:\s+\w+){1,3}\b/g) || [];
      topics.push(...keyTerms.slice(0, 2)); // Take first 2 key phrases
    }
    
    // Extract company names or tickers
    const companyMatches = content.match(/\b[A-Z]{1,5}\b/g) || [];
    topics.push(...companyMatches.slice(0, 2));
    
    return [...new Set(topics)].slice(0, 5); // Remove duplicates and limit to 5
  }

  // Helper method to extract key words from AI response
  private extractKeyWords(content: string): string[] {
    const words: string[] = [];
    
    // Extract specific product names, technical terms, etc.
    const specificTerms = content.match(/\b(?:VEVYE|IHEEZO|TRIESENCE|VAFA|PhilRx|cyclosporine|ophthalmology|dry eye|prescriptions|buy-and-bill)\b/gi) || [];
    words.push(...specificTerms);
    
    // Extract key business terms
    const businessTerms = content.match(/\b(?:sales|marketing|team|program|access|growth|revenue|market|customers|partners)\b/gi) || [];
    words.push(...businessTerms.slice(0, 3));
    
    return [...new Set(words)].slice(0, 8); // Remove duplicates and limit to 8
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
      
      // Add a small random seed to prevent Google AI caching
      const randomSeed = Math.floor(Math.random() * 1000000);
      
      const requestBody: GoogleAIRequest = {
        contents: [
          {
            parts: [
              {
                text: prompt.replace('TRANSCRIPT: ' + transcriptText, 'TRANSCRIPT: ' + truncatedTranscript) + `\n\nRandom seed: ${randomSeed}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.9,
          topP: 1.0,
          topK: 40,
          maxOutputTokens: 2048
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
          temperature: 0.9,
          topP: 1.0,
          topK: 40,
          maxOutputTokens: 2048
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