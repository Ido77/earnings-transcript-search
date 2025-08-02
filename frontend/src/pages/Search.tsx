import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from '@/components/ui/toaster';

const Search = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize state from URL params and localStorage
  const [query, setQuery] = useState(() => {
    const urlQuery = searchParams.get('q') || '';
    const savedQuery = localStorage.getItem('searchQuery') || '';
    return urlQuery || savedQuery;
  });
  
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [results, setResults] = useState<any>(() => {
    const savedResults = localStorage.getItem('searchResults');
    return savedResults ? JSON.parse(savedResults) : null;
  });
  
  const [searchType, setSearchType] = useState<'keyword' | 'phrase' | 'regex' | 'fuzzy'>(() => {
    const savedType = localStorage.getItem('searchType') as 'keyword' | 'phrase' | 'regex' | 'fuzzy';
    return savedType || 'keyword';
  });
  
  const [sortBy, setSortBy] = useState<'relevance' | 'date'>(() => {
    const savedSort = localStorage.getItem('searchSortBy') as 'relevance' | 'date';
    return savedSort || 'relevance';
  });
  
  const [currentPage, setCurrentPage] = useState(1);
  const [keywordRequirements, setKeywordRequirements] = useState<{[key: string]: boolean}>(() => {
    const saved = localStorage.getItem('searchKeywordRequirements');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [filters, setFilters] = useState(() => {
    const savedFilters = localStorage.getItem('searchFilters');
    return savedFilters ? JSON.parse(savedFilters) : {
      tickers: '',
      years: '',
      quarters: '',
      dateFrom: '',
      dateTo: '',
    };
  });
  const [availableTickers, setAvailableTickers] = useState<Array<{ticker: string, companyName: string}>>([]);
  const [tickerSuggestions, setTickerSuggestions] = useState<Array<{ticker: string, companyName: string}>>([]);
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<{[key: string]: string}>({});
  const [ollamaStatus, setOllamaStatus] = useState<{available: boolean, model?: string}>({available: false});

  // Save state to localStorage and update URL
  const saveSearchState = (newQuery?: string, newResults?: any, newType?: string, newSort?: string, newFilters?: any, newKeywordReqs?: any) => {
    const queryToSave = newQuery !== undefined ? newQuery : query;
    const resultsToSave = newResults !== undefined ? newResults : results;
    const typeToSave = newType !== undefined ? newType : searchType;
    const sortToSave = newSort !== undefined ? newSort : sortBy;
    const filtersToSave = newFilters !== undefined ? newFilters : filters;
    const keywordReqsToSave = newKeywordReqs !== undefined ? newKeywordReqs : keywordRequirements;

    // Save to localStorage
    localStorage.setItem('searchQuery', queryToSave);
    localStorage.setItem('searchResults', JSON.stringify(resultsToSave));
    localStorage.setItem('searchType', typeToSave);
    localStorage.setItem('searchSortBy', sortToSave);
    localStorage.setItem('searchFilters', JSON.stringify(filtersToSave));
    localStorage.setItem('searchKeywordRequirements', JSON.stringify(keywordReqsToSave));

    // Update URL parameters
    const newSearchParams = new URLSearchParams();
    if (queryToSave) newSearchParams.set('q', queryToSave);
    if (typeToSave !== 'keyword') newSearchParams.set('type', typeToSave);
    if (sortToSave !== 'relevance') newSearchParams.set('sort', sortToSave);
    setSearchParams(newSearchParams);
  };

  // Load available tickers with company names and check Ollama status
  React.useEffect(() => {
    const loadTickers = async () => {
      try {
        const response = await fetch('/us_tickers_enhanced.txt');
        const text = await response.text();
        const tickerList = text.trim().split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => {
            const parts = line.split('\t');
            return {
              ticker: parts[0],
              companyName: parts[1] || 'Unknown'
            };
          });
        setAvailableTickers(tickerList);
      } catch (error) {
        console.error('Failed to load enhanced ticker list:', error);
      }
    };

    const checkOllamaStatus = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/ollama/health');
        if (response.ok) {
          const status = await response.json();
          setOllamaStatus(status);
        }
      } catch (error) {
        console.error('Failed to check Ollama status:', error);
      }
    };
    
    loadTickers();
    checkOllamaStatus();
  }, []);

  // Save state when search parameters change
  React.useEffect(() => {
    if (query || results) {
      saveSearchState();
    }
  }, [query, searchType, sortBy, filters, keywordRequirements]);

  // Auto-search when returning to page with saved query
  React.useEffect(() => {
    const savedQuery = localStorage.getItem('searchQuery');
    const savedResults = localStorage.getItem('searchResults');
    
    if (savedQuery && !savedResults && !loading) {
      // If we have a saved query but no results, perform the search
      handleSearch();
    }
  }, []);

  // Filter ticker suggestions based on input
  const handleTickerInputChange = (value: string) => {
    setFilters(prev => ({ ...prev, tickers: value }));
    
    if (value.trim()) {
      const searchTerm = value.toLowerCase();
      const suggestions = availableTickers
        .filter(item => 
          item.ticker.toLowerCase().includes(searchTerm) ||
          item.companyName.toLowerCase().includes(searchTerm)
        )
        .slice(0, 10);
      setTickerSuggestions(suggestions);
    } else {
      setTickerSuggestions([]);
    }
  };

  // Helper function to get company name for a ticker
  const getCompanyName = (ticker: string) => {
    const tickerData = availableTickers.find(item => item.ticker === ticker.toUpperCase());
    return tickerData?.companyName || null;
  };

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

  const summarizeTranscript = async (transcriptId: string, ticker: string, year: number, quarter: number) => {
    if (summarizing === transcriptId) return; // Prevent double-clicking
    
    setSummarizing(transcriptId);
    
    try {
      const response = await fetch(`http://localhost:3001/api/transcripts/${transcriptId}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchQuery: query // Pass the search query for context
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate summary');
      }
      
      const data = await response.json();
      
      setSummaries(prev => ({
        ...prev,
        [transcriptId]: data.summary
      }));
      
      toast(`AI summary created for ${ticker} ${year} Q${quarter}`, 'success');
      
    } catch (error) {
      console.error('Error generating summary:', error);
      toast(error instanceof Error ? error.message : "Failed to generate summary.", 'error');
    } finally {
      setSummarizing(null);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      toast('Please enter a search query', 'error');
      return;
    }

    setLoading(true);
    try {
      // Parse keywords and their requirements
      const keywords = query.split(/\s+/).filter(k => k.trim().length > 0);
      const requiredKeywords = keywords.filter(keyword => keywordRequirements[keyword] !== false);
      const optionalKeywords = keywords.filter(keyword => keywordRequirements[keyword] === false);

      // For phrase search, treat the entire query as one phrase
      if (searchType === 'phrase') {
        const phraseQuery = query.trim();
        const searchFilters: any = {
          limit: 20,
          offset: 0,
          searchType: 'phrase',
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

        const response = await fetch('http://localhost:3001/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: phraseQuery,
            searchType: 'phrase',
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
        setCurrentPage(1);
        
        toast(
          `Found ${data.total} results in ${data.executionTime}ms`, 
          'success'
        );
        return;
      }

      // Regular keyword search logic
      const searchFilters: any = {
        limit: 20,
        offset: 0,
        requiredKeywords,
        optionalKeywords,
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
          query: keywords.join(' '),
          searchType,
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
      setCurrentPage(1); // Reset page to 1 after new search
      
      // Save search state
      saveSearchState(query, data, searchType, sortBy, filters, keywordRequirements);
      
      toast(
        `Found ${data.total} results in ${data.executionTime}ms`, 
        'success'
      );
    } catch (error) {
      console.error('Search error:', error);
      toast('Search failed. Check console for details.', 'error');
      
      // Show error message instead of demo results
      toast('No transcripts found in database. Please add some transcripts first.', 'error');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !results || results.total <= results.results.length) {
      return;
    }

    setLoadingMore(true);
    try {
      const offset = results.results.length;
      const searchFilters: any = {
        limit: 20,
        offset,
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
      setResults((prev: any) => ({
        ...prev,
        results: [...prev.results, ...data.results],
        total: data.total,
        page: data.page,
        limit: data.limit,
        executionTime: data.executionTime,
      }));
      setCurrentPage((prev: number) => prev + 1);
      
      toast(
        `Loaded ${data.results.length} more results in ${data.executionTime}ms`, 
        'success'
      );
    } catch (error) {
      console.error('Load more error:', error);
      toast('Failed to load more results. Check console for details.', 'error');
    } finally {
      setLoadingMore(false);
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
    setCurrentPage(1); // Reset page to 1 when clearing filters
    
    // Clear localStorage
    localStorage.removeItem('searchQuery');
    localStorage.removeItem('searchResults');
    localStorage.removeItem('searchType');
    localStorage.removeItem('searchSortBy');
    localStorage.removeItem('searchFilters');
    localStorage.removeItem('searchKeywordRequirements');
    
    // Clear URL parameters
    setSearchParams({});
  };

  const handleResultClick = (result: any) => {
    // Navigate to transcript page with search query for highlighting
    const searchParams = new URLSearchParams();
    if (query.trim()) {
      searchParams.set('highlight', query.trim());
    }
    if (searchType) {
      searchParams.set('searchType', searchType);
    }
    
    const url = `/transcript/${result.id}?${searchParams.toString()}`;
    navigate(url);
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
              Search Keywords
            </label>
            <input
              id="query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter keywords separated by spaces (e.g., revenue growth AI)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              disabled={loading || loadingMore}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <p className="text-xs text-gray-500 mt-1">
              Each keyword will be searched separately. Use checkboxes below to mark required keywords.
            </p>
          </div>

          {/* Keyword Selection */}
          {query.trim() && searchType !== 'phrase' && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-medium mb-3">Keyword Requirements</h4>
              <div className="space-y-2">
                {query.split(/\s+/).filter(k => k.trim().length > 0).map((keyword, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id={`keyword-${index}`}
                      checked={keywordRequirements[keyword] !== false}
                      onChange={(e) => setKeywordRequirements(prev => ({
                        ...prev,
                        [keyword]: e.target.checked
                      }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={`keyword-${index}`} className="text-sm">
                      <span className="font-medium">{keyword}</span>
                      <span className="text-gray-500 ml-1">
                        {keywordRequirements[keyword] !== false ? '(required)' : '(optional)'}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                ✓ Checked = Must appear in transcript | ☐ Unchecked = Optional
              </p>
            </div>
          )}

          {/* Phrase Search Info */}
          {query.trim() && searchType === 'phrase' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2 text-blue-800 dark:text-blue-200">Phrase Search</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Searching for exact phrase: <span className="font-mono bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded">"{query}"</span>
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                The entire phrase must appear exactly as written, including spaces and punctuation.
              </p>
            </div>
          )}

          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Type
              </label>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value as 'keyword' | 'phrase' | 'regex' | 'fuzzy')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="keyword">Keyword (exact words)</option>
                <option value="phrase">Phrase (exact phrase)</option>
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
          <div className="flex gap-4 items-center">
            <button
              onClick={handleSearch}
              disabled={loading || loadingMore || !query.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            
            <button
              onClick={handleClear}
              disabled={loading || loadingMore}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>

            {/* Ollama Status Indicator */}
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${ollamaStatus.available ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-gray-600 dark:text-gray-400">
                {ollamaStatus.available ? `AI Summary (${ollamaStatus.model})` : 'AI Summary (Unavailable)'}
              </span>
            </div>
          </div>
        </div>

        {/* Advanced Filters */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Advanced Filters</h3>
            {availableTickers.length > 0 && (
              <span className="text-sm text-gray-500">
                {availableTickers.length.toLocaleString()} US companies available
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tickers (comma-separated)
              </label>
              <input
                type="text"
                value={filters.tickers}
                onChange={e => handleTickerInputChange(e.target.value)}
                placeholder="e.g., AAPL, MSFT, GOOGL (optional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading || loadingMore}
              />
              {tickerSuggestions.length > 0 && (
                <div className="mt-2 bg-white dark:bg-gray-700 rounded-md shadow-sm">
                  {tickerSuggestions.map((item, index) => (
                    <div
                      key={index}
                      className="p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                      onClick={() => {
                        setFilters(prev => ({ ...prev, tickers: `${prev.tickers},${item.ticker}` }));
                        setTickerSuggestions([]);
                      }}
                    >
                      {item.ticker} - {item.companyName}
                    </div>
                  ))}
                </div>
              )}
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
                disabled={loading || loadingMore}
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
                disabled={loading || loadingMore}
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
                disabled={loading || loadingMore}
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
                disabled={loading || loadingMore}
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
                    className="bg-white dark:bg-gray-700 rounded-lg border p-4 hover:shadow-md transition-all duration-200 cursor-pointer"
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold text-lg">
                          {result.ticker} - {result.year} Q{result.quarter}
                        </h4>
                        {(result.companyName || getCompanyName(result.ticker)) && (
                          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
                            {result.companyName || getCompanyName(result.ticker)}
                          </p>
                        )}
                        {result.callDate && (
                          <p className="text-sm text-muted-foreground">
                            Date: {new Date(result.callDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(result.id, result.ticker, result.year, result.quarter);
                          }}
                          className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-1"
                          title="Copy full transcript to clipboard"
                        >
                          📋
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            summarizeTranscript(result.id, result.ticker, result.year, result.quarter);
                          }}
                          disabled={summarizing === result.id}
                          className="px-3 py-1 bg-blue-100 hover:bg-blue-200 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-1 disabled:opacity-50"
                          title="Generate AI summary"
                        >
                          {summarizing === result.id ? '🤖...' : '🤖'}
                        </button>
                        {result.relevanceScore && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            Score: {(result.relevanceScore * 100).toFixed(0)}%
                          </span>
                        )}
                        {result.totalMatchCount && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            {result.totalMatchCount} total matches
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Keyword-specific scores */}
                    {result.keywordMatches && result.keywordMatches.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {result.keywordMatches.map((keywordMatch: any, idx: number) => (
                          <span
                            key={idx}
                            className={`px-2 py-1 text-xs rounded-full ${
                              keywordMatch.matchCount > 0
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                            title={`${keywordMatch.keyword}: ${keywordMatch.matchCount} matches`}
                          >
                            {keywordMatch.keyword}: {keywordMatch.matchCount}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-600 p-3 rounded border-l-4 border-blue-500">
                      <div dangerouslySetInnerHTML={{ __html: result.snippet }} />
                    </div>
                    
                    {/* AI Summary */}
                    {summaries[result.id] && (
                      <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-green-600 dark:text-green-400 font-medium">🤖 AI Summary</span>
                          <span className="text-xs text-gray-500">Generated with Ollama</span>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {summaries[result.id]}
                        </div>
                      </div>
                    )}
                    
                    {/* Click indicator */}
                    <div className="mt-3 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <span>Click to view full transcript with highlighted search terms</span>
                      <span>→</span>
                    </div>
                  </div>
                ))}
              </div>

              {results.total > results.results.length && (
                <div className="mt-4 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore || results.total <= results.results.length}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingMore ? 'Loading...' : 'Load More Results'}
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