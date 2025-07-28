import React, { useState } from 'react';
import { toast } from '@/components/ui/toaster';

const Search = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [searchType, setSearchType] = useState<'keyword' | 'regex' | 'fuzzy'>('keyword');
  const [sortBy, setSortBy] = useState<'relevance' | 'date'>('relevance');
  const [filters, setFilters] = useState({
    tickers: '',
    years: '',
    quarters: '',
    dateFrom: '',
    dateTo: '',
  });

  const copyToClipboard = async (transcriptId: string, ticker: string, year: number, quarter: number) => {
    try {
      // First, get the full transcript from the backend
      const response = await fetch(`http://localhost:3001/api/transcripts/${transcriptId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch full transcript');
      }
      
      const transcriptData = await response.json();
      const fullText = transcriptData.fullTranscript || transcriptData.transcript || '';
      
      if (!fullText) {
        throw new Error('No transcript text found');
      }

      await navigator.clipboard.writeText(fullText);
      alert(`✅ ${ticker.toUpperCase()} ${year} Q${quarter} transcript copied to clipboard (${fullText.length.toLocaleString()} characters)`);
    } catch (err) {
      console.error('Copy failed:', err);
      alert(`❌ Failed to copy transcript: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      toast('Please enter a search query', 'error');
      return;
    }

    setLoading(true);
    try {
      // Parse filters
      const searchFilters: any = {
        limit: 20,
        offset: 0,
      };

      if (filters.tickers) {
        searchFilters.tickers = filters.tickers.split(',').map(t => t.trim().toUpperCase()).filter(t => t);
      }
      if (filters.years) {
        searchFilters.years = filters.years.split(',').map(y => parseInt(y.trim())).filter(y => !isNaN(y));
      }
      if (filters.quarters) {
        searchFilters.quarters = filters.quarters.split(',').map(q => parseInt(q.trim())).filter(q => !isNaN(q) && q >= 1 && q <= 4);
      }
      if (filters.dateFrom) {
        searchFilters.dateFrom = filters.dateFrom;
      }
      if (filters.dateTo) {
        searchFilters.dateTo = filters.dateTo;
      }

      // Determine search endpoint
      let endpoint = 'http://localhost:3001/api/search';
      if (searchType === 'regex') {
        endpoint += '/regex';
      } else if (searchType === 'fuzzy') {
        endpoint += '/fuzzy';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          filters: searchFilters,
          highlight: true,
          sortBy,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResults(data);
      
      toast(
        `Found ${data.total} results in ${data.executionTime}ms`, 
        'success'
      );
    } catch (error) {
      console.error('Search error:', error);
      toast('Search failed. Check console for details.', 'error');
      
      // For demo purposes, show mock search results
      const mockResults = {
        results: [
          {
            id: 'demo-1',
            ticker: 'AAPL',
            companyName: 'Apple Inc.',
            year: 2023,
            quarter: 4,
            callDate: '2023-11-02',
            snippet: `We're pleased to report strong quarterly results with revenue growth driven by ${query}...`,
            relevanceScore: 0.95,
            matchCount: 3,
          },
          {
            id: 'demo-2',
            ticker: 'MSFT',
            companyName: 'Microsoft Corporation',
            year: 2023,
            quarter: 3,
            callDate: '2023-07-25',
            snippet: `Our cloud business continues to show momentum, with ${query} being a key driver...`,
            relevanceScore: 0.87,
            matchCount: 2,
          },
        ],
        total: 2,
        page: 1,
        limit: 20,
        executionTime: 145,
        query,
        filters: {},
      };
      setResults(mockResults);
      toast('Showing demo search results', 'info');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults(null);
    setFilters({
      tickers: '',
      years: '',
      quarters: '',
      dateFrom: '',
      dateTo: '',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search Transcripts</h1>
        <p className="text-muted-foreground">
          Search through earnings call transcripts with advanced filters
        </p>
      </div>

      <div className="grid gap-6">
        {/* Search Input */}
        <div className="space-y-4">
          <div>
            <label htmlFor="query" className="block text-sm font-medium mb-2">
              Search Query
            </label>
            <input
              id="query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter search terms (e.g., revenue, growth, AI, cloud)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              disabled={loading}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>

          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Type
              </label>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value as 'keyword' | 'regex' | 'fuzzy')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="keyword">Keyword</option>
                <option value="regex">Regex</option>
                <option value="fuzzy">Fuzzy</option>
              </select>
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'relevance' | 'date')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="relevance">Relevance</option>
                <option value="date">Date (Most Recent)</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            
            <button
              onClick={handleClear}
              disabled={loading}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Advanced Filters */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Advanced Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="tickers" className="block text-sm font-medium mb-1">
                Tickers (comma-separated)
              </label>
              <input
                id="tickers"
                type="text"
                value={filters.tickers}
                onChange={(e) => setFilters(prev => ({ ...prev, tickers: e.target.value }))}
                placeholder="AAPL, MSFT, GOOGL"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="years" className="block text-sm font-medium mb-1">
                Years (comma-separated)
              </label>
              <input
                id="years"
                type="text"
                value={filters.years}
                onChange={(e) => setFilters(prev => ({ ...prev, years: e.target.value }))}
                placeholder="2023, 2022, 2021"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="quarters" className="block text-sm font-medium mb-1">
                Quarters (comma-separated)
              </label>
              <input
                id="quarters"
                type="text"
                value={filters.quarters}
                onChange={(e) => setFilters(prev => ({ ...prev, quarters: e.target.value }))}
                placeholder="1, 2, 3, 4"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="dateFrom" className="block text-sm font-medium mb-1">
                Date From
              </label>
              <input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="dateTo" className="block text-sm font-medium mb-1">
                Date To
              </label>
              <input
                id="dateTo"
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {/* Search Results */}
        {results && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Search Results</h3>
                <div className="text-sm text-muted-foreground">
                  {results.total} results in {results.executionTime}ms
                </div>
              </div>

              <div className="space-y-4">
                {results.results.map((result: any, index: number) => (
                  <div
                    key={result.id || index}
                    className="bg-white dark:bg-gray-700 rounded-lg border p-4"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold text-lg">
                          {result.ticker} - {result.year} Q{result.quarter}
                        </h4>
                        {result.companyName && (
                          <p className="text-sm text-muted-foreground">{result.companyName}</p>
                        )}
                        {result.callDate && (
                          <p className="text-sm text-muted-foreground">
                            Date: {new Date(result.callDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => copyToClipboard(result.id, result.ticker, result.year, result.quarter)}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-1"
                          title="Copy full transcript to clipboard"
                        >
                          📋
                        </button>
                        {result.relevanceScore && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            Score: {(result.relevanceScore * 100).toFixed(0)}%
                          </span>
                        )}
                        {result.matchCount && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            {result.matchCount} matches
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-600 p-3 rounded border-l-4 border-blue-500">
                      <div dangerouslySetInnerHTML={{ __html: result.snippet }} />
                    </div>
                  </div>
                ))}
              </div>

              {results.total > results.results.length && (
                <div className="mt-4 text-center">
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    Load More Results
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Search; 