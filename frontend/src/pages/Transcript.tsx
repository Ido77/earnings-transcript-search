import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Share2, Copy, User, Building, Briefcase } from 'lucide-react';
import { toast } from '@/components/ui/toaster';

interface TranscriptSegment {
  speaker: string;
  company?: string;
  role?: string;
  text: string;
}

interface TranscriptData {
  id: string;
  ticker: string;
  companyName?: string;
  year: number;
  quarter: number;
  callDate?: string;
  fullTranscript: string;
  transcript?: string;
  transcriptSplit?: TranscriptSegment[];
}

export default function Transcript() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedTranscript, setHighlightedTranscript] = useState<string>('');
  const [highlightedSegments, setHighlightedSegments] = useState<TranscriptSegment[]>([]);
  const [viewMode, setViewMode] = useState<'split' | 'full'>('split');
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [summaryCacheStatus, setSummaryCacheStatus] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<{available: boolean, model?: string}>({available: false});
  const [multipleSummaries, setMultipleSummaries] = useState<any>(null);
  const [generatingMultiple, setGeneratingMultiple] = useState(false);

  const highlightQuery = searchParams.get('highlight');
  const searchType = searchParams.get('searchType');

  useEffect(() => {
    const fetchTranscript = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const response = await fetch(`http://localhost:3001/api/transcripts/${id}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch transcript: ${response.status}`);
        }

        const data = await response.json();
        setTranscript(data);

        // Check if we have premium transcript_split data
        if (data.transcriptSplit && Array.isArray(data.transcriptSplit)) {
          // Use premium split format
          if (highlightQuery) {
            const highlighted = highlightSegments(data.transcriptSplit, highlightQuery, searchType);
            setHighlightedSegments(highlighted);
          } else {
            setHighlightedSegments(data.transcriptSplit);
          }
          setViewMode('split');
        } else {
          // Use formatted transcript format
          const formattedText = formatTranscript(data);
          if (highlightQuery) {
            const highlighted = highlightSearchTerms(formattedText, highlightQuery, searchType);
            setHighlightedTranscript(highlighted);
          } else {
            setHighlightedTranscript(formattedText);
          }
          setViewMode('full');
        }
      } catch (err) {
        console.error('Error fetching transcript:', err);
        setError(err instanceof Error ? err.message : 'Failed to load transcript');
      } finally {
        setLoading(false);
      }
    };

    fetchTranscript();
  }, [id, highlightQuery, searchType]);

  // Check Ollama status and load cached summaries
  useEffect(() => {
          const checkGoogleAIStatus = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/google-ai/health');
        if (response.ok) {
          const data = await response.json();
          setOllamaStatus(data);
        }
      } catch (error) {
        console.error('Failed to check Ollama status:', error);
      }
    };

    const loadCachedSummary = async () => {
      if (!id) return;
      
      try {
        const response = await fetch(`http://localhost:3001/api/transcripts/${id}/summaries`);
        if (response.ok) {
          const data = await response.json();
          if (data.summaries && data.summaries.length > 0) {
            // Load the first cached summary (most recent or general)
            const cachedSummary = data.summaries[0];
            setSummary(cachedSummary.summary);
            setSummaryCacheStatus(true);
          }
        }
      } catch (error) {
        console.error('Error loading cached summaries:', error);
      }
    };

            checkGoogleAIStatus();
    loadCachedSummary();
  }, [id]);

  const highlightSegments = (segments: TranscriptSegment[], query: string, type: string | null): TranscriptSegment[] => {
    if (!query.trim()) return segments;

    return segments.map(segment => {
      let highlightedText = segment.text;

      if (type === 'keyword') {
        // For keyword search, highlight each word separately
        const keywords = query.split(/\s+/).filter(k => k.trim().length > 0);
        keywords.forEach(keyword => {
          const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
          highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
        });
      } else if (type === 'phrase') {
        // For phrase search, highlight the exact phrase
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
      } else if (type === 'regex') {
        // For regex search, be careful with highlighting
        try {
          const regex = new RegExp(query, 'gi');
          highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$&</mark>');
        } catch (err) {
          // If regex is invalid, fall back to simple highlighting
          const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
          highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
        }
      } else {
        // Default to simple highlighting
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
      }

      return {
        ...segment,
        text: highlightedText,
      };
    });
  };

  const formatTranscript = (transcript: TranscriptData): string => {
    // Get company name
    const companyNames: { [key: string]: string } = {
      'NVDA': 'NVIDIA Corporation',
      'AAPL': 'Apple Inc.',
      'MSFT': 'Microsoft Corporation',
      'GOOGL': 'Alphabet Inc.',
      'TSLA': 'Tesla, Inc.',
      'AMZN': 'Amazon.com, Inc.',
      'META': 'Meta Platforms, Inc.',
      'NFLX': 'Netflix, Inc.',
      'DIS': 'The Walt Disney Company',
      'JPM': 'JPMorgan Chase & Co.',
      'JNJ': 'Johnson & Johnson',
      'PG': 'The Procter & Gamble Company',
      'HD': 'The Home Depot, Inc.',
      'V': 'Visa Inc.',
      'MA': 'Mastercard Incorporated',
      'UNH': 'UnitedHealth Group Incorporated',
      'BRK-B': 'Berkshire Hathaway Inc.',
      'CRM': 'Salesforce, Inc.',
      'ADBE': 'Adobe Inc.',
      'PYPL': 'PayPal Holdings, Inc.',
      'CMCSA': 'Comcast Corporation',
      'PEP': 'PepsiCo, Inc.',
      'TMO': 'Thermo Fisher Scientific Inc.',
      'ABT': 'Abbott Laboratories',
      'COST': 'Costco Wholesale Corporation',
      'ACN': 'Accenture plc',
      'MRK': 'Merck & Co., Inc.',
      'DHR': 'Danaher Corporation',
      'VZ': 'Verizon Communications Inc.',
      'NKE': 'NIKE, Inc.'
    };

    const companyName = companyNames[transcript.ticker.toUpperCase()] || `${transcript.ticker.toUpperCase()} Corporation`;
    
    // Format the date
    let formattedDate = '';
    if (transcript.callDate) {
      const date = new Date(transcript.callDate);
      formattedDate = date.toLocaleDateString('en-US', { 
        month: 'numeric', 
        day: 'numeric', 
        year: '2-digit' 
      });
    }

    // Create header
    const header = `${companyName}, Q${transcript.quarter} ${transcript.year} Earnings Call, ${transcript.callDate ? new Date(transcript.callDate).toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    }) : 'Date TBD'}`;
    
    const dateLine = formattedDate || 'Date TBD';
    
    // Format the transcript content
    let formattedContent = transcript.fullTranscript || transcript.transcript || '';
    
    // If the transcript has speaker information, format it properly
    if (formattedContent.includes(':')) {
      // Split by lines and format each speaker section
      const lines = formattedContent.split('\n');
      const formattedLines = lines.map(line => {
        if (line.includes(':')) {
          const [speaker, ...textParts] = line.split(':');
          const text = textParts.join(':').trim();
          if (text) {
            return `${speaker.trim()}\n\n${text}`;
          }
        }
        return line;
      });
      formattedContent = formattedLines.join('\n\n');
    }

    // Combine everything
    return `${header}\n${dateLine}\n\n${formattedContent}`;
  };

  const highlightSearchTerms = (text: string, query: string, type: string | null): string => {
    if (!query.trim()) return text;

    let highlightedText = text;

    if (type === 'keyword') {
      // For keyword search, highlight each word separately
      const keywords = query.split(/\s+/).filter(k => k.trim().length > 0);
      keywords.forEach(keyword => {
        const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
      });
    } else if (type === 'phrase') {
      // For phrase search, highlight the exact phrase
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
    } else if (type === 'regex') {
      // For regex search, be careful with highlighting
      try {
        const regex = new RegExp(query, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$&</mark>');
      } catch (err) {
        // If regex is invalid, fall back to simple highlighting
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
      }
    } else {
      // Default to simple highlighting
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    return highlightedText;
  };

  const copyToClipboard = async () => {
    if (!transcript) return;

    try {
      const text = formatTranscript(transcript);
      await navigator.clipboard.writeText(text);
      toast('Formatted transcript copied to clipboard!', 'success');
    } catch (err) {
      toast('Failed to copy transcript', 'error');
    }
  };

  const getResponseTitle = (id: number, content: string, analystType?: string): string => {
    // Use the analystType if available (from backend)
    if (analystType) {
      return analystType;
    }
    
    // Fallback to old logic if analystType is not available
    if (content.includes('THE HIDDEN GOLDMINE')) {
      return 'Primary Discovery';
    }
    if (content.includes('THE OPERATIONAL EDGE')) {
      return 'Operational Edge';
    }
    if (content.includes('THE ACCESS OPPORTUNITY')) {
      return 'Market Access';
    }
    if (content.includes('THE FINANCIAL EDGE')) {
      return 'Financial Leverage';
    }
    if (content.includes('THE ASSET PLAY')) {
      return 'Asset Arbitrage';
    }
    if (content.includes('Fallback Response')) {
      return `Analysis ${id}`;
    }
    
    // Default fallback
    return `Analysis ${id}`;
  };

  const getSectionsForResponse = (content: string, analystType?: string) => {
    // Claude - Deep Value Investor
    if (analystType === 'Claude') {
      return [
        { pattern: 'Hidden Insight:', color: 'emerald', bgColor: 'emerald', icon: '💡' },
        { pattern: 'Why It\'s Hidden:', color: 'blue', bgColor: 'blue', icon: '🔍' },
        { pattern: 'Business Impact:', color: 'purple', bgColor: 'purple', icon: '📈' },
        { pattern: 'Supporting Evidence:', color: 'amber', bgColor: 'amber', icon: '📊' },
        { pattern: 'Bullish Rating:', color: 'green', bgColor: 'green', icon: '🚀' },
        { pattern: 'Confidence Level:', color: 'indigo', bgColor: 'indigo', icon: '🎯' },
        { pattern: 'Time Horizon:', color: 'cyan', bgColor: 'cyan', icon: '⏰' },
        { pattern: 'Catalyst Type:', color: 'rose', bgColor: 'rose', icon: '⚡' }
      ];
    }
    
    // Gemini - Skeptical Investment Analyst
    if (analystType === 'Gemini') {
      return [
        { pattern: 'Hidden Insight:', color: 'emerald', bgColor: 'emerald', icon: '💡' },
        { pattern: 'Evidence & Reasoning:', color: 'blue', bgColor: 'blue', icon: '🔍' },
        { pattern: 'Bullishness Score:', color: 'green', bgColor: 'green', icon: '📊' },
        { pattern: 'Confidence Level:', color: 'indigo', bgColor: 'indigo', icon: '🎯' }
      ];
    }
    
    // DeepSeek - Strategic Insight Analyst (JSON format)
    if (analystType === 'DeepSeek') {
      return [
        { pattern: '"insight":', color: 'emerald', bgColor: 'emerald', icon: '💡' },
        { pattern: '"impact_driver":', color: 'blue', bgColor: 'blue', icon: '📈' },
        { pattern: '"evidence":', color: 'amber', bgColor: 'amber', icon: '📊' },
        { pattern: '"bullish_scale":', color: 'green', bgColor: 'green', icon: '🚀' },
        { pattern: '"reasoning":', color: 'purple', bgColor: 'purple', icon: '🧠' }
      ];
    }
    
    // Grok - Expert Industry Analyst
    if (analystType === 'Grok') {
      return [
        { pattern: 'Insight:', color: 'emerald', bgColor: 'emerald', icon: '💡' },
        { pattern: 'Impact:', color: 'blue', bgColor: 'blue', icon: '📈' },
        { pattern: 'Rating:', color: 'green', bgColor: 'green', icon: '📊' }
      ];
    }
    
    // Fallback for unknown types
    return [
      { pattern: 'What investors are missing:', color: 'purple', bgColor: 'purple', icon: '💡' },
      { pattern: 'The scale disconnect:', color: 'red', bgColor: 'red', icon: '📊' },
      { pattern: 'Why competitors can\'t replicate this:', color: 'green', bgColor: 'green', icon: '🛡️' },
      { pattern: 'Timing catalyst:', color: 'blue', bgColor: 'blue', icon: '⏰' },
      { pattern: 'Opportunity size:', color: 'gray', bgColor: 'gray', icon: '📈' }
    ];
  };

  const downloadTranscript = () => {
    if (!transcript) return;

    const text = formatTranscript(transcript);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcript.ticker}_${transcript.year}_Q${transcript.quarter}_formatted_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const summarizeTranscript = async () => {
    if (!transcript || summarizing) return;
    
    setSummarizing(true);
    
    try {
      const response = await fetch(`http://localhost:3001/api/transcripts/${transcript.id}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchQuery: highlightQuery || null // Pass the search query for context
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate summary');
      }
      
      const data = await response.json();
      
      setSummary(data.summary);
      setSummaryCacheStatus(data.cached || false);
      
      const cacheStatus = data.cached ? ' (cached)' : '';
      toast(`AI summary created for ${transcript.ticker} ${transcript.year} Q${transcript.quarter}${cacheStatus}`, 'success');
      
    } catch (error) {
      console.error('Error generating summary:', error);
      toast(error instanceof Error ? error.message : "Failed to generate summary.", 'error');
    } finally {
      setSummarizing(false);
    }
  };

  const generateMultipleSummaries = async () => {
    if (!transcript || generatingMultiple) return;
    
    setGeneratingMultiple(true);
    
    try {
      const response = await fetch(`http://localhost:3001/api/transcripts/${transcript.id}/multiple-summaries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchQuery: highlightQuery || null // Pass the search query for context
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate multiple summaries');
      }
      
      const data = await response.json();
      
      setMultipleSummaries(data.multipleSummaries);
      
      toast(`Generated ${data.multipleSummaries.successCount}/4 AI perspectives for ${transcript.ticker} ${transcript.year} Q${transcript.quarter}`, 'success');
      
    } catch (error) {
      console.error('Error generating multiple summaries:', error);
      toast(error instanceof Error ? error.message : "Failed to generate multiple summaries.", 'error');
    } finally {
      setGeneratingMultiple(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Link to="/search" className="flex items-center space-x-2 text-blue-600 hover:text-blue-800">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Search</span>
          </Link>
        </div>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading transcript...</p>
        </div>
      </div>
    );
  }

  if (error || !transcript) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Link to="/search" className="flex items-center space-x-2 text-blue-600 hover:text-blue-800">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Search</span>
          </Link>
        </div>
        <div className="text-center py-12">
          <p className="text-red-600">Error: {error || 'Transcript not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/search" className="flex items-center space-x-2 text-blue-600 hover:text-blue-800">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Search</span>
          </Link>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={summarizeTranscript}
            disabled={summarizing || !ollamaStatus.available}
            className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition-colors duration-200 ${
              summaryCacheStatus 
                ? 'bg-green-100 hover:bg-green-200 text-green-800 border-green-300' 
                : 'bg-blue-100 hover:bg-blue-200 text-blue-800 border-blue-300'
            } disabled:opacity-50`}
            title={summaryCacheStatus ? "AI summary (cached)" : "Generate AI summary"}
          >
            <span className="text-lg">
              {summarizing ? '🤖...' : summaryCacheStatus ? '🤖💾' : '🤖'}
            </span>
            <span>AI Summary</span>
          </button>
          <button
            onClick={generateMultipleSummaries}
            disabled={generatingMultiple || !ollamaStatus.available}
            className="flex items-center space-x-2 px-4 py-2 border rounded-lg transition-colors duration-200 bg-purple-100 hover:bg-purple-200 text-purple-800 border-purple-300 disabled:opacity-50"
            title="Generate 5 AI perspectives"
          >
            <span className="text-lg">
              {generatingMultiple ? '🔄...' : '🎯'}
            </span>
            <span>5 Perspectives</span>
          </button>
          <button
            onClick={copyToClipboard}
            className="flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
            title="Copy transcript to clipboard"
          >
            <Copy className="h-4 w-4" />
            <span>Copy</span>
          </button>
          <button
            onClick={downloadTranscript}
            className="flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
            title="Download transcript as text file"
          >
            <Download className="h-4 w-4" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Transcript Info */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {formatTranscript(transcript).split('\n')[0]}
            </h1>
            {transcript.callDate && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Call Date: {new Date(transcript.callDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* Search Highlight Info */}
        {highlightQuery && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h3 className="text-sm font-medium mb-2 text-blue-800 dark:text-blue-200">
              Search Results Highlighted
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Search query: <span className="font-mono bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded">"{highlightQuery}"</span>
              {searchType && (
                <span className="ml-2">(Search type: {searchType})</span>
              )}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
              Highlighted terms are marked in yellow. Use Ctrl+F to find more instances.
            </p>
          </div>
        )}

        {/* AI Summary */}
        {summary && (
          <div className="mb-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden ai-summary-card">
            {/* Enhanced Header with Gradient */}
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400 opacity-10"></div>
              <div className="relative flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-900/20 dark:via-yellow-900/20 dark:to-orange-900/20">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                                         <div className="relative">
                       <span className="text-3xl">🎯</span>
                       <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full status-indicator"></div>
                     </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                        AI Market Analysis
                      </h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Hidden opportunities & market catalysts
                      </p>
                    </div>
                  </div>
                  
                  {/* Status Badges */}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      Google AI
                    </span>
                    {summaryCacheStatus && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full border border-green-200 dark:border-green-800">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        Cached
                      </span>
                    )}
                  </div>
                </div>
                
                                 <div className="flex items-center gap-2">
                   <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg shadow-md">
                     <span className="text-lg">💎</span>
                     Market Catalysts
                   </span>
                   <button
                     onClick={() => {
                       navigator.clipboard.writeText(summary);
                       toast('AI Summary copied to clipboard!', 'success');
                     }}
                     className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors focus-enhanced"
                     title="Copy AI Summary"
                   >
                     <Copy className="h-4 w-4" />
                     Copy
                   </button>
                 </div>
              </div>
            </div>

            {/* Enhanced Content */}
            <div className="p-6 max-h-[600px] overflow-y-auto">
              {(() => {
                // Extract thinking process
                const thinkMatch = summary.match(/<think>([\s\S]*?)<\/think>/);
                const thinkingProcess = thinkMatch ? thinkMatch[1].trim() : null;
                
                // Extract catalyst content (everything after thinking process)
                const catalystContent = summary.replace(/<think>[\s\S]*?<\/think>/, '').trim();
                
                return (
                  <div className="space-y-6">
                    {/* Thinking Process Section */}
                    {thinkingProcess && (
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 shadow-sm">
                        <details className="group">
                          <summary className="cursor-pointer flex items-center gap-3 font-semibold text-blue-800 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200 transition-colors">
                            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                              <span className="text-lg">🧠</span>
                            </div>
                            <span className="text-lg">AI Analysis Process</span>
                            <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded-full group-open:hidden">
                              Click to expand
                            </span>
                            <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded-full hidden group-open:inline">
                              Click to collapse
                            </span>
                          </summary>
                          <div className="mt-4 text-sm text-blue-700 dark:text-blue-200 leading-relaxed bg-white dark:bg-gray-800 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
                            {thinkingProcess.split('\n').map((line, index) => (
                              <p key={index} className="mb-2">{line}</p>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                    
                                         {/* Enhanced Goldmine Content */}
                     <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-900/20 dark:via-yellow-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-6 shadow-lg ai-summary-content">
                       <div className="prose prose-lg max-w-none">
                        {catalystContent.split('\n').map((line, index) => {
                          const trimmedLine = line.trim();
                          if (!trimmedLine) return null;
                          
                          // Enhanced Goldmine Header
                          if (trimmedLine.includes('🎯 THE HIDDEN GOLDMINE')) {
                            return (
                              <div key={index} className="mb-6 text-center">
                                                                 <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full shadow-lg goldmine-header interactive-element">
                                   <span className="text-2xl">🎯</span>
                                   <h3 className="text-xl font-bold tracking-wide">
                                     THE HIDDEN GOLDMINE
                                   </h3>
                                   <span className="text-2xl">💎</span>
                                 </div>
                              </div>
                            );
                          }
                          
                          // Boring Quote Section
                          if (trimmedLine.startsWith('The Boring Quote:')) {
                            const quoteText = trimmedLine.replace('The Boring Quote:', '').trim();
                            return (
                              <div key={index} className="mb-6">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex items-center justify-center w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                    <span className="text-lg">💬</span>
                                  </div>
                                  <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                                    The Boring Quote
                                  </h4>
                                </div>
                                                                 <div className="bg-white dark:bg-gray-800 border-l-4 border-gray-400 dark:border-gray-600 pl-4 py-3 rounded-r-lg shadow-sm quote-block">
                                   <p className="text-gray-700 dark:text-gray-300 italic font-medium">
                                     "{quoteText}"
                                   </p>
                                 </div>
                              </div>
                            );
                          }
                          
                                                     // Why It's Actually Massive Section
                           if (trimmedLine.startsWith('Why It\'s Actually Massive:')) {
                             const explanationText = trimmedLine.replace('Why It\'s Actually Massive:', '').trim();
                             return (
                               <div key={index} className="mb-6 summary-section">
                                 <div className="flex items-center gap-3 mb-3">
                                   <div className="flex items-center justify-center w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                     <span className="text-lg">💥</span>
                                   </div>
                                   <h4 className="text-lg font-semibold text-red-800 dark:text-red-300">
                                     Why It's Actually Massive
                                   </h4>
                                 </div>
                                 <div className="bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 shadow-sm">
                                   <p className="text-red-700 dark:text-red-300 font-medium leading-relaxed">
                                     {explanationText}
                                   </p>
                                 </div>
                               </div>
                             );
                           }
                          
                                                     // The Advantage Section
                           if (trimmedLine.startsWith('The Advantage:')) {
                             const advantageText = trimmedLine.replace('The Advantage:', '').trim();
                             return (
                               <div key={index} className="mb-6 summary-section">
                                 <div className="flex items-center gap-3 mb-3">
                                   <div className="flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                     <span className="text-lg">🛡️</span>
                                   </div>
                                   <h4 className="text-lg font-semibold text-green-800 dark:text-green-300">
                                     The Advantage
                                   </h4>
                                 </div>
                                 <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 shadow-sm">
                                   <p className="text-green-700 dark:text-green-300 font-medium leading-relaxed">
                                     {advantageText}
                                   </p>
                                 </div>
                               </div>
                             );
                           }
                          
                                                     // Size Potential Section
                           if (trimmedLine.startsWith('Size Potential:')) {
                             const sizeText = trimmedLine.replace('Size Potential:', '').trim();
                             let sizeIcon = '📊';
                             let sizeClasses = {
                               container: 'bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20 border border-gray-200 dark:border-gray-800',
                               text: 'text-gray-700 dark:text-gray-300'
                             };
                             
                             if (sizeText.toLowerCase().includes('small')) {
                               sizeIcon = '🔵';
                               sizeClasses = {
                                 container: 'bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800',
                                 text: 'text-blue-700 dark:text-blue-300'
                               };
                             } else if (sizeText.toLowerCase().includes('medium')) {
                               sizeIcon = '🟡';
                               sizeClasses = {
                                 container: 'bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border border-yellow-200 dark:border-yellow-800',
                                 text: 'text-yellow-700 dark:text-yellow-300'
                               };
                             } else if (sizeText.toLowerCase().includes('large')) {
                               sizeIcon = '🟠';
                               sizeClasses = {
                                 container: 'bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border border-orange-200 dark:border-orange-800',
                                 text: 'text-orange-700 dark:text-orange-300'
                               };
                             } else if (sizeText.toLowerCase().includes('extra large')) {
                               sizeIcon = '🔴';
                               sizeClasses = {
                                 container: 'bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border border-red-200 dark:border-red-800',
                                 text: 'text-red-700 dark:text-red-300'
                               };
                             }
                             
                             return (
                               <div key={index} className="mb-6 summary-section">
                                 <div className="flex items-center gap-3 mb-3">
                                   <div className="flex items-center justify-center w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                     <span className="text-lg">{sizeIcon}</span>
                                   </div>
                                   <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                                     Size Potential
                                   </h4>
                                 </div>
                                 <div className={`${sizeClasses.container} rounded-lg p-4 shadow-sm`}>
                                   <p className={`${sizeClasses.text} font-bold text-lg`}>
                                     {sizeText}
                                   </p>
                                 </div>
                               </div>
                             );
                           }
                          
                          // Fallback for other content
                          return (
                            <p key={index} className="text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
                              {trimmedLine}
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* AI Investment Analysis - Premium Design */}
        {multipleSummaries && (
          <div className="mb-16">
            {/* Executive Header */}
            <div className="mb-12">
              <div className="relative overflow-hidden bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900"></div>
                <div className="relative px-10 py-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="relative">
                        <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 via-blue-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl ring-4 ring-white/20">
                          <span className="text-4xl">🎯</span>
                        </div>
                        <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-pulse flex items-center justify-center shadow-lg">
                          <span className="text-lg">✨</span>
                        </div>
                      </div>
                      <div>
                        <h1 className="text-4xl font-black text-white tracking-tight mb-2">
                          AI Investment Analysis
                        </h1>
                        <p className="text-xl text-blue-200 font-semibold mb-1">
                          Professional Market Intelligence
                        </p>
                        <p className="text-sm text-blue-300 font-medium opacity-90">
                          Four Expert AI Perspectives • Advanced Pattern Recognition • Strategic Insights
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-5">
                      <div className="bg-white/10 backdrop-blur-xl rounded-2xl px-6 py-4 border border-white/20 shadow-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 bg-green-400 rounded-full animate-pulse shadow-lg"></div>
                          <div className="text-center">
                            <div className="text-2xl font-black text-white">
                              {multipleSummaries.successCount}/4
                            </div>
                            <div className="text-xs text-blue-200 font-semibold">
                              Analysis Complete
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          let exportText = '';
                          
                          // Add synthesized thesis if available
                          if (multipleSummaries.synthesizedThesis) {
                            exportText += `╔═══ UNIFIED INVESTMENT THESIS ═══╗\n\n${multipleSummaries.synthesizedThesis}\n\n╚${'═'.repeat(50)}╝\n\n\n`;
                          }
                          
                          // Add individual analyst reports
                          const allResponses = multipleSummaries.responses.map((r: any) => 
                            `╔═══ ${r.analystType?.toUpperCase() || 'AI ANALYST'} REPORT ═══╗\n\n${r.content}\n\n╚${'═'.repeat(40)}╝\n\n`
                          ).join('');
                          
                          exportText += allResponses;
                          navigator.clipboard.writeText(exportText);
                          toast('📋 Complete AI analysis suite with thesis exported to clipboard!', 'success');
                        }}
                        className="bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 hover:border-white/40 px-6 py-4 rounded-2xl transition-all duration-300 group shadow-lg hover:shadow-xl"
                        title="Export Complete Analysis"
                      >
                        <div className="flex items-center gap-3">
                          <Copy className="h-5 w-5 text-white group-hover:scale-110 transition-transform duration-200" />
                          <div className="text-left">
                            <div className="text-white font-bold text-sm">Export Suite</div>
                            <div className="text-blue-200 text-xs font-medium">All 4 Reports</div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Synthesized Investment Thesis */}
            {multipleSummaries.synthesizedThesis && (
              <div className="mb-16">
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-3xl p-8 shadow-lg">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-lg">
                      <span className="text-2xl">💡</span>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                        Unified Investment Thesis
                      </h3>
                      <p className="text-amber-700 dark:text-amber-300 font-medium">
                        Synthesized from all 4 analyst perspectives
                      </p>
                    </div>
                  </div>
                  <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-2xl p-6 border border-amber-200/50 dark:border-amber-700/50">
                    <div className="text-gray-800 dark:text-gray-200 leading-relaxed text-lg font-medium">
                      {multipleSummaries.synthesizedThesis}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI Analyst Reports - Clean & Minimal */}
            <div className="space-y-16">
              {multipleSummaries.responses.map((response: any, index: number) => {
                const analystStyles = {
                  'Claude': { 
                    name: 'Claude',
                    role: 'Deep Value Investor',
                    accentColor: '#059669',
                    icon: '🧠'
                  },
                  'Gemini': { 
                    name: 'Gemini',
                    role: 'Skeptical Investment Analyst',
                    accentColor: '#2563eb',
                    icon: '🔍'
                  },
                  'DeepSeek': { 
                    name: 'DeepSeek',
                    role: 'Strategic Insight Analyst',
                    accentColor: '#7c3aed',
                    icon: '⚡'
                  },
                  'Grok': { 
                    name: 'Grok',
                    role: 'Expert Industry Analyst',
                    accentColor: '#dc2626',
                    icon: '🚀'
                  }
                };

                const style = analystStyles[response.analystType as keyof typeof analystStyles] || analystStyles['Claude'];

                return (
                  <div key={response.id} className="group">
                    {/* Clean Header */}
                    <div className="flex items-center gap-4 mb-8 pb-4 border-b-2 border-gray-100 dark:border-gray-800">
                      <div 
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg"
                        style={{ backgroundColor: style.accentColor }}
                      >
                        <span className="text-2xl">{style.icon}</span>
                      </div>
                      <div className="flex-1">
                        <h2 
                          className="text-3xl font-bold mb-1"
                          style={{ color: style.accentColor }}
                        >
                          {style.name}
                        </h2>
                        <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">
                          {style.role}
                        </p>
                      </div>
                      <div className="text-sm text-gray-400 dark:text-gray-500 font-mono">
                        {response.processingTime}ms
                      </div>
                    </div>

                    {/* Clean Content */}
                    <div className="prose prose-lg max-w-none">
                      {(() => {
                        let content = response.content;
                        
                        // Clean DeepSeek JSON processing
                        if (response.analystType === 'DeepSeek') {
                          try {
                            const jsonMatch = content.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                              const data = JSON.parse(jsonMatch[0]);
                              content = `
💡 **Key Strategic Insight**
${data.insight || ''}

📈 **Primary Impact Driver**
${data.impact_driver || ''}

📊 **Supporting Evidence**
${data.evidence || ''}

🎯 **Bullish Assessment**
${data.bullish_scale || ''}

🧠 **Strategic Reasoning**
${data.reasoning || ''}`.trim();
                            }
                          } catch (e) {
                            console.log('JSON parsing error:', e);
                          }
                        }
                        
                        // Enhanced text processing for beautiful typography
                        content = content
                          .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-white">$1</strong>')
                          .replace(/\*(.+?)\*/g, '<em class="italic text-gray-700 dark:text-gray-300">$1</em>')
                          .replace(/## (.+?)$/gm, '<h3 class="text-2xl font-bold text-gray-900 dark:text-white mb-4 mt-8">$1</h3>')
                          .replace(/\n\n+/g, '\n')
                          .trim();
                        
                        const contentLines = content.split('\n');
                        const sectionDefs = getSectionsForResponse(response.content, response.analystType);
                        
                        return contentLines.map((line: string, idx: number) => {
                          const cleanLine = line.trim();
                          if (!cleanLine) return null;
                          
                          // Handle headers
                          if (cleanLine.startsWith('<h3')) {
                            return (
                              <div key={idx} className="mb-6" 
                                   dangerouslySetInnerHTML={{ __html: cleanLine }} />
                            );
                          }
                          
                          // Clean section matching
                          const matchedSection = sectionDefs.find(sec => {
                            const normalizedPattern = sec.pattern.replace(/[:"]/g, '').toLowerCase().trim();
                            const normalizedLine = cleanLine.replace(/[:"]/g, '').toLowerCase().trim();
                            return normalizedLine.includes(normalizedPattern) || cleanLine.includes(sec.pattern);
                          });
                          
                          if (matchedSection) {
                            let sectionContent = cleanLine;
                            const possiblePatterns = [
                              matchedSection.pattern,
                              matchedSection.pattern.replace(':', ''),
                              matchedSection.pattern.replace(/"/g, ''),
                              matchedSection.pattern.replace(/[:"]/g, '')
                            ];
                            
                            for (const pattern of possiblePatterns) {
                              if (sectionContent.includes(pattern)) {
                                sectionContent = sectionContent.replace(pattern, '').trim();
                                break;
                              }
                            }
                            
                            return (
                              <div key={idx} className="mb-8">
                                <div className="flex items-center gap-3 mb-4">
                                  <span className="text-2xl">{matchedSection.icon}</span>
                                  <h4 
                                    className="text-xl font-bold"
                                    style={{ color: style.accentColor }}
                                  >
                                    {matchedSection.pattern.replace(/[:"]/g, '')}
                                  </h4>
                                </div>
                                <div className="ml-11">
                                  <div 
                                    className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg"
                                    dangerouslySetInnerHTML={{ __html: sectionContent }}
                                  />
                                </div>
                              </div>
                            );
                          }
                          
                          // Handle regular content
                          if (cleanLine && !cleanLine.startsWith('{') && !cleanLine.startsWith('}')) {
                            return (
                              <div key={idx} className="mb-6">
                                <div 
                                  className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg"
                                  dangerouslySetInnerHTML={{ __html: cleanLine }} 
                                />
                              </div>
                            );
                          }
                          
                          return null;
                        });
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* View Mode Toggle */}
        {transcript.transcriptSplit && Array.isArray(transcript.transcriptSplit) && transcript.transcriptSplit.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">View Mode:</span>
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('split')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    viewMode === 'split'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  Premium Split View
                </button>
                <button
                  onClick={() => setViewMode('full')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    viewMode === 'full'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  Formatted View
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Transcript Content */}
        <div className="prose max-w-none">
          {viewMode === 'split' && transcript.transcriptSplit && Array.isArray(transcript.transcriptSplit) && transcript.transcriptSplit.length > 0 ? (
            <div className="space-y-6">
              {highlightedSegments.map((segment, index) => (
                <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="flex items-start space-x-3 mb-2">
                    <div className="flex-shrink-0">
                      <User className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 text-lg">
                          {segment.speaker}
                        </span>
                        {segment.role && (
                          <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            {segment.role}
                          </span>
                        )}
                      </div>
                      {segment.company && (
                        <div className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                          <Building className="h-4 w-4" />
                          <span>{segment.company}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div 
                    className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap ml-8"
                    dangerouslySetInnerHTML={{ __html: segment.text }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div 
              className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: highlightedTranscript }}
            />
          )}
        </div>
      </div>
    </div>
  );
}