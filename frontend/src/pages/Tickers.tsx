import React, { useState } from 'react';
import { toast } from '@/components/ui/toaster';

const Tickers = () => {
  const [tickers, setTickers] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [popularTickers] = useState([
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK-B', 'UNH', 'JNJ',
    'JPM', 'V', 'PG', 'HD', 'MA', 'NFLX', 'DIS', 'PYPL', 'ADBE', 'CRM',
    'CMCSA', 'PEP', 'TMO', 'ABT', 'COST', 'ACN', 'MRK', 'DHR', 'VZ', 'NKE'
  ]);
  
  // File upload and progress tracking
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    currentTicker: '',
    processed: [] as string[],
    failed: [] as string[],
    skipped: [] as string[]
  });
  const [progressLog, setProgressLog] = useState<string[]>([]);

  // Load available tickers from us_tickers.txt
  React.useEffect(() => {
    const loadTickers = async () => {
      try {
        const response = await fetch('/us_tickers.txt');
        const text = await response.text();
        const tickerList = text.trim().split('\n').map(t => t.trim()).filter(t => t);
        setAvailableTickers(tickerList);
      } catch (error) {
        console.error('Failed to load ticker list:', error);
      }
    };
    
    // Load saved progress on startup
    const loadProgress = () => {
      const saved = localStorage.getItem('bulk-fetch-progress');
      if (saved) {
        try {
          const progressData = JSON.parse(saved);
          setProgress(progressData);
          setProgressLog(progressData.log || []);
        } catch (error) {
          console.error('Failed to load progress:', error);
        }
      }
    };
    
    loadTickers();
    loadProgress();
  }, []);

  // Save progress to localStorage
  const saveProgress = (progressData: any) => {
    const dataToSave = {
      ...progressData,
      log: progressLog,
      timestamp: Date.now()
    };
    localStorage.setItem('bulk-fetch-progress', JSON.stringify(dataToSave));
  };

  const addPopularTickers = () => {
    setTickers(popularTickers.join(', '));
  };

  const addRandomTickers = () => {
    if (availableTickers.length === 0) return;
    const shuffled = [...availableTickers].sort(() => 0.5 - Math.random());
    const random20 = shuffled.slice(0, 20);
    setTickers(random20.join(', '));
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      parseTickersFromFile(file);
    }
  };

  // Parse tickers from uploaded file
  const parseTickersFromFile = async (file: File) => {
    try {
      const text = await file.text();
      const tickerList = text
        .split(/[\n,\r\t\s]+/)
        .map(t => t.trim().toUpperCase())
        .filter(t => t && t.length >= 1 && t.length <= 5); // Basic ticker validation
      
      setTickers(tickerList.join(', '));
      
      // Setup progress tracking
      const newProgress = {
        current: 0,
        total: tickerList.length,
        currentTicker: '',
        processed: [],
        failed: [],
        skipped: []
      };
      setProgress(newProgress);
      setProgressLog([`📁 Loaded ${tickerList.length} tickers from ${file.name}`]);
      
      toast(`Loaded ${tickerList.length} tickers from file`, 'success');
    } catch (error) {
      console.error('Error parsing file:', error);
      toast('Failed to parse ticker file', 'error');
    }
  };

  // Progressive bulk fetch with crash recovery
  const handleProgressiveBulkFetch = async () => {
    if (!tickers.trim() && !uploadedFile) {
      toast('Please enter tickers or upload a file', 'error');
      return;
    }

    const tickerList = tickers
      .split(/[\n,\r\t\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0);

    if (tickerList.length === 0) {
      toast('No valid tickers found', 'error');
      return;
    }

    setIsProcessing(true);
    setResults(null);

    // Check for existing progress and resume
    let startIndex = 0;
    if (progress.processed.length > 0 || progress.failed.length > 0 || progress.skipped.length > 0) {
      startIndex = progress.processed.length + progress.failed.length + progress.skipped.length;
      setProgressLog(prev => [...prev, `🔄 Resuming from ticker ${startIndex + 1}/${tickerList.length}`]);
    }

    const allResults: any[] = [];
    let successCount = progress.processed.length;
    let failedCount = progress.failed.length;
    let skippedCount = progress.skipped.length;

    try {
      for (let i = startIndex; i < tickerList.length; i++) {
        const ticker = tickerList[i];
        
        // Update progress
        const newProgress = {
          ...progress,
          current: i + 1,
          total: tickerList.length,
          currentTicker: ticker
        };
        setProgress(newProgress);
        saveProgress(newProgress);

        setProgressLog(prev => [...prev, `⏳ Processing ${ticker} (${i + 1}/${tickerList.length})`]);

        try {
          const response = await fetch('http://localhost:3001/api/tickers/bulk-fetch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tickers: [ticker] }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          allResults.push(...data.results);

          // Update counters based on results
          data.results.forEach((result: any) => {
            if (result.status === 'success') {
              if (result.skipped) {
                skippedCount++;
                newProgress.skipped.push(ticker);
                setProgressLog(prev => [...prev, `⏭️ ${ticker} - Already cached`]);
              } else {
                successCount++;
                newProgress.processed.push(ticker);
                setProgressLog(prev => [...prev, `✅ ${ticker} - ${result.transcriptLength?.toLocaleString()} characters`]);
              }
            } else {
              failedCount++;
              newProgress.failed.push(ticker);
              setProgressLog(prev => [...prev, `❌ ${ticker} - ${result.error || 'Failed'}`]);
            }
          });

          setProgress(newProgress);
          saveProgress(newProgress);

          // Small delay to prevent overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          failedCount++;
          const newProgress = {
            ...progress,
            failed: [...progress.failed, ticker]
          };
          setProgress(newProgress);
          saveProgress(newProgress);
          
          setProgressLog(prev => [...prev, `❌ ${ticker} - ${error instanceof Error ? error.message : 'Unknown error'}`]);
          console.error(`Error processing ${ticker}:`, error);
        }
      }

      // Final results
      setResults({
        results: allResults,
        summary: {
          total: tickerList.length,
          successful: successCount,
          failed: failedCount,
          skipped: skippedCount
        },
        executionTime: 0
      });

      setProgressLog(prev => [...prev, `🎉 Completed! ${successCount} successful, ${skippedCount} skipped, ${failedCount} failed`]);
      
      // Clear progress after successful completion
      localStorage.removeItem('bulk-fetch-progress');
      
      toast(`Completed processing ${tickerList.length} tickers`, 'success');

    } catch (error) {
      console.error('Bulk fetch error:', error);
      toast('Bulk fetch failed. Progress saved for resumption.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setTickers('');
    setResults(null);
    setUploadedFile(null);
    setProgress({
      current: 0,
      total: 0,
      currentTicker: '',
      processed: [],
      failed: [],
      skipped: []
    });
    setProgressLog([]);
    localStorage.removeItem('bulk-fetch-progress');
  };

  const clearProgress = () => {
    localStorage.removeItem('bulk-fetch-progress');
    setProgress({
      current: 0,
      total: 0,
      currentTicker: '',
      processed: [],
      failed: [],
      skipped: []
    });
    setProgressLog([]);
    toast('Progress cleared', 'success');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ticker Management</h1>
        <p className="text-muted-foreground">
          Add tickers to fetch earnings call transcripts - supports file upload with crash recovery
        </p>
      </div>

      <div className="grid gap-6">
        <div className="space-y-4">
          {/* Manual Input */}
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
              disabled={isProcessing}
            />
            {availableTickers.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Available: {availableTickers.join(', ').substring(0, 100)}...
              </p>
            )}
          </div>

          {/* File Upload */}
          <div>
            <label htmlFor="file-upload" className="block text-sm font-medium mb-2">
              Or Upload Ticker File (.txt, .csv)
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".txt,.csv,.tsv"
              onChange={handleFileUpload}
              disabled={isProcessing}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
            {uploadedFile && (
              <p className="text-sm text-green-600 mt-1">
                📁 {uploadedFile.name} loaded ({progress.total} tickers)
              </p>
            )}
          </div>

          {/* Quick Selection Buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={addPopularTickers}
              disabled={isProcessing}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors duration-200 disabled:opacity-50"
            >
              📈 Popular 30
            </button>
            <button
              onClick={addRandomTickers}
              disabled={isProcessing || availableTickers.length === 0}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors duration-200 disabled:opacity-50"
            >
              🎲 Random 20
            </button>
          </div>

          {/* Progress Tracking */}
          {(progress.total > 0 || isProcessing) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold">Processing Progress</h3>
                {!isProcessing && progress.total > 0 && (
                  <button
                    onClick={clearProgress}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Clear Progress
                  </button>
                )}
              </div>
              
              <div className="mb-2">
                <div className="flex justify-between text-sm mb-1">
                  <span>{progress.current}/{progress.total} tickers</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
              
              {progress.currentTicker && (
                <p className="text-sm text-blue-700 mb-2">
                  Currently processing: <strong>{progress.currentTicker}</strong>
                </p>
              )}
              
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-green-600">
                  ✅ Processed: {progress.processed.length}
                </div>
                <div className="text-yellow-600">
                  ⏭️ Skipped: {progress.skipped.length}
                </div>
                <div className="text-red-600">
                  ❌ Failed: {progress.failed.length}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleProgressiveBulkFetch}
              disabled={isProcessing || (!tickers.trim() && !uploadedFile)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Processing...
                </>
              ) : (
                'Bulk Fetch Transcripts'
              )}
            </button>
            
            <button
              onClick={handleClear}
              disabled={isProcessing}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Progress Log */}
        {progressLog.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Processing Log</h3>
            <div className="max-h-64 overflow-y-auto space-y-1 text-sm font-mono">
              {progressLog.slice(-50).map((log, index) => (
                <div key={index} className="text-gray-700 dark:text-gray-300">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}

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