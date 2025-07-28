import React, { useState } from 'react';
import { toast } from '@/components/ui/toaster';

const Tickers = () => {
  const [tickers, setTickers] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleBulkFetch = async () => {
    if (!tickers.trim()) {
      toast('Please enter at least one ticker', 'error');
      return;
    }

    const tickerList = tickers
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0);

    if (tickerList.length === 0) {
      toast('Please enter valid tickers', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/tickers/bulk-fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tickers: tickerList }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResults(data);
      
      toast(
        `Successfully processed ${data.summary.successful} transcripts in ${data.executionTime}ms`, 
        'success'
      );
    } catch (error) {
      console.error('Error fetching tickers:', error);
      toast('Failed to fetch transcripts. Check console for details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setTickers('');
    setResults(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ticker Management</h1>
        <p className="text-muted-foreground">
          Add tickers to fetch earnings call transcripts
        </p>
      </div>

      <div className="grid gap-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="tickers" className="block text-sm font-medium mb-2">
              Enter Tickers (comma-separated)
            </label>
            <input
              id="tickers"
              type="text"
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              placeholder="AAPL, MSFT, GOOGL, TSLA, NVDA"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              disabled={loading}
            />
          </div>
          
          <div className="flex gap-4">
            <button
              onClick={handleBulkFetch}
              disabled={loading || !tickers.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Fetching...' : 'Bulk Fetch Transcripts'}
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

        {results && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Fetch Results</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{results.summary.successful}</div>
                  <div className="text-sm text-muted-foreground">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{results.summary.failed}</div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{results.summary.notAvailable}</div>
                  <div className="text-sm text-muted-foreground">Not Available</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.executionTime}ms</div>
                  <div className="text-sm text-muted-foreground">Execution Time</div>
                </div>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {results.results.map((result: any, index: number) => (
                  <div
                    key={index}
                    className={`p-3 rounded-md border ${
                      result.status === 'success'
                        ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                        : result.status === 'failed'
                        ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                        : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">
                          {result.ticker} {result.year && `${result.year} Q${result.quarter}`}
                        </div>
                        {result.transcriptLength && (
                          <div className="text-sm text-muted-foreground">
                            {result.transcriptLength.toLocaleString()} characters
                          </div>
                        )}
                        {result.note && (
                          <div className="text-sm text-blue-600 mt-1">{result.note}</div>
                        )}
                        {result.error && (
                          <div className="text-sm text-red-600 mt-1">{result.error}</div>
                        )}
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        result.status === 'success'
                          ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                          : result.status === 'failed'
                          ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'
                      }`}>
                        {result.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tickers; 