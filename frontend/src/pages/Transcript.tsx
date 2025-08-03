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

  const highlightQuery = searchParams.get('highlight');
  const searchType = searchParams.get('searchType');

  useEffect(() => {
    const fetchTranscript = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/transcripts/${id}`);
        
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
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🤖</span>
                  <span className="font-semibold text-gray-900 dark:text-white">AI Summary</span>
                </div>
                <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded-full">
                  Generated with Ollama
                </span>
                {summaryCacheStatus && (
                  <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded-full">
                    💾 Cached
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                                            <span className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 px-3 py-1 rounded-full font-medium">
                              🚀 Market Catalysts
                            </span>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 max-h-96 overflow-y-auto">
              {(() => {
                // Extract thinking process
                const thinkMatch = summary.match(/<think>([\s\S]*?)<\/think>/);
                const thinkingProcess = thinkMatch ? thinkMatch[1].trim() : null;
                
                // Extract catalyst content (everything after thinking process)
                const catalystContent = summary.replace(/<think>[\s\S]*?<\/think>/, '').trim();
                
                return (
                  <div className="space-y-4">
                    {/* Thinking Process Section */}
                    {thinkingProcess && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <details className="group">
                          <summary className="cursor-pointer flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200">
                            <span className="text-lg">🧠</span>
                            <span>AI Analysis Process</span>
                            <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded-full">
                              Click to expand
                            </span>
                          </summary>
                          <div className="mt-3 text-sm text-blue-700 dark:text-blue-200 leading-relaxed">
                            {thinkingProcess.split('\n').map((line, index) => (
                              <p key={index} className="mb-2">{line}</p>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}
                    
                    {/* Catalyst Content */}
                    <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-lg p-4">
                      <div className="prose prose-sm max-w-none">
                        {catalystContent.split('\n').map((line, index) => {
                          const trimmedLine = line.trim();
                          if (!trimmedLine) return null;
                          
                          if (trimmedLine.startsWith('🚀')) {
                            return (
                              <h3 key={index} className="text-lg font-bold text-orange-800 dark:text-orange-300 mb-3">
                                {trimmedLine}
                              </h3>
                            );
                          } else if (trimmedLine.startsWith('The Big Opportunity:')) {
                            return (
                              <div key={index} className="mb-3">
                                <h4 className="font-semibold text-orange-700 dark:text-orange-200 mb-2">
                                  The Big Opportunity:
                                </h4>
                                <p className="text-orange-600 dark:text-orange-300">
                                  {trimmedLine.replace('The Big Opportunity:', '').trim()}
                                </p>
                              </div>
                            );
                          } else if (trimmedLine.startsWith('Why It Matters:')) {
                            return (
                              <div key={index} className="mb-3">
                                <h4 className="font-semibold text-orange-700 dark:text-orange-200 mb-2">
                                  Why It Matters:
                                </h4>
                              </div>
                            );
                          } else if (trimmedLine.startsWith('*')) {
                            return (
                              <li key={index} className="text-orange-600 dark:text-orange-300 ml-4">
                                {trimmedLine.replace('*', '').trim()}
                              </li>
                            );
                          } else if (trimmedLine.startsWith('Impact T-Shirt Sizing:')) {
                            return (
                              <div key={index} className="mb-3">
                                <h4 className="font-semibold text-orange-700 dark:text-orange-200 mb-2">
                                  Impact T-Shirt Sizing:
                                </h4>
                              </div>
                            );
                          } else if (trimmedLine.startsWith('🟢 Small')) {
                            return (
                              <div key={index} className="mb-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                                <p className="text-green-700 dark:text-green-300 text-sm">
                                  {trimmedLine}
                                </p>
                              </div>
                            );
                          } else if (trimmedLine.startsWith('🟡 Medium')) {
                            return (
                              <div key={index} className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                                <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                                  {trimmedLine}
                                </p>
                              </div>
                            );
                          } else if (trimmedLine.startsWith('🔴 Large')) {
                            return (
                              <div key={index} className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                                <p className="text-red-700 dark:text-red-300 text-sm">
                                  {trimmedLine}
                                </p>
                              </div>
                            );
                          } else if (trimmedLine.startsWith('Most Likely Scenario:')) {
                            return (
                              <div key={index} className="mb-3">
                                <h4 className="font-semibold text-orange-700 dark:text-orange-200 mb-2">
                                  Most Likely Scenario:
                                </h4>
                                <p className="text-orange-600 dark:text-orange-300">
                                  {trimmedLine.replace('Most Likely Scenario:', '').trim()}
                                </p>
                              </div>
                            );
                          } else {
                            return (
                              <p key={index} className="text-orange-600 dark:text-orange-300">
                                {trimmedLine}
                              </p>
                            );
                          }
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
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