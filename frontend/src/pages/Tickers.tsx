import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const Tickers = () => {
  const [tickers, setTickers] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [fileContent, setFileContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentJob, setCurrentJob] = useState<any>(null);
  const [jobProgress, setJobProgress] = useState<any>(null);
  const [backgroundJobs, setBackgroundJobs] = useState<any[]>([]);
  const [quarterCount, setQuarterCount] = useState<number>(1);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();

  // Load background jobs on component mount
  useEffect(() => {
    loadBackgroundJobs();
    // Set up interval to check for background jobs every 5 seconds
    const interval = setInterval(loadBackgroundJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  // Clean up progress interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const loadBackgroundJobs = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/jobs/enhanced');
      if (response.ok) {
        const data = await response.json();
        setBackgroundJobs(data.jobs);
      }
    } catch (error) {
      console.error('Failed to load background jobs:', error);
    }
  };

  const addPopularTickers = () => {
    setTickers('AAPL, MSFT, GOOGL, TSLA, NVDA');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setFileContent(content);
        // Parse and display ticker count
        const lines = content.split('\n').filter(line => line.trim());
        const tickerCount = lines.length;
        alert(`File loaded: ${tickerCount} tickers found`);
      };
      reader.readAsText(file);
    }
  };

  const handleBulkUpload = async () => {
    if (!fileContent.trim()) {
      alert('Please upload a file first');
      return;
    }

    setLoading(true);
    try {
      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch('http://localhost:3001/api/jobs/bulk-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileContent, quarterCount }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setCurrentJob(data);
        alert(`Bulk upload job created! Job ID: ${data.jobId}\n\nThis will run in the background. You can navigate to other pages and the job will continue running.`);
        
        // Start monitoring progress
        startProgressMonitoring(data.jobId);
      } else {
        let errorMessage = 'Unknown error';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please try again.';
        } else {
          errorMessage = error.message;
        }
      }
      alert(`Failed to start bulk upload: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const startProgressMonitoring = (jobId: string) => {
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    // Check progress every 2 seconds
    progressIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/jobs/${jobId}/progress`);
        if (response.ok) {
          const progress = await response.json();
          setJobProgress(progress);
          
          // If job is completed, stop monitoring
          if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled') {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            alert(`Job ${progress.status}! Processed: ${progress.progress.processed.length}, Failed: ${progress.progress.failed.length}, Skipped: ${progress.progress.skipped.length}`);
            loadBackgroundJobs(); // Refresh job list
          }
        }
      } catch (error) {
        console.error('Failed to check progress:', error);
      }
    }, 2000);
  };

  const handleBulkFetch = async () => {
    if (!tickers.trim()) {
      alert('Please enter tickers');
      return;
    }

    setLoading(true);
    try {
      const tickerList = tickers
        .split(/[\n,\r\t\s]+/)
        .map(t => t.trim().toUpperCase())
        .filter(t => t.length > 0);

      const response = await fetch('http://localhost:3001/api/tickers/bulk-fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tickers: tickerList }),
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data);
        alert(`Bulk fetch completed! ${data.summary.successful} successful, ${data.summary.failed} failed`);
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error}`);
      }
    } catch (error) {
      alert(`Failed to fetch transcripts: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJobControl = async (jobId: string, action: 'pause' | 'resume' | 'cancel') => {
    try {
      const response = await fetch(`http://localhost:3001/api/jobs/${jobId}/${action}`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Job ${action}d successfully`);
        loadBackgroundJobs(); // Refresh job list
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error}`);
      }
    } catch (error) {
      alert(`Failed to ${action} job: ${error}`);
    }
  };

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-600';
      case 'completed': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      case 'paused': return 'text-yellow-600';
      case 'cancelled': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  const formatProgress = (job: any) => {
    const progress = job.progress;
    const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return `${progress.current}/${progress.total} (${percentage}%)`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Bulk Transcript Fetcher</h1>

        {/* File Upload Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">📁 Upload Ticker File</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Upload ticker file (TXT format with TICKER\tCompany Name)
              </label>
              <input
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            {selectedFile && (
              <div className="text-sm text-gray-600">
                Selected: {selectedFile.name} ({fileContent.split('\n').filter(line => line.trim()).length} tickers)
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">
                Number of quarters to fetch (from latest)
              </label>
              <select
                value={quarterCount}
                onChange={(e) => setQuarterCount(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={1}>1 quarter (default)</option>
                <option value={2}>2 quarters</option>
                <option value={3}>3 quarters</option>
                <option value={4}>4 quarters</option>
                <option value={6}>6 quarters</option>
                <option value={8}>8 quarters</option>
              </select>
            </div>
            <button
              onClick={handleBulkUpload}
              disabled={loading || !fileContent}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded"
            >
              {loading ? 'Starting Upload...' : '🚀 Start Bulk Upload'}
            </button>
          </div>
        </div>

        {/* Manual Ticker Input Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">✏️ Manual Ticker Input</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Enter tickers (comma or newline separated)
              </label>
              <textarea
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                placeholder="AAPL, MSFT, GOOGL, TSLA, NVDA"
                className="w-full h-32 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={addPopularTickers}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
              >
                Add Popular Tickers
              </button>
              <button
                onClick={handleBulkFetch}
                disabled={loading || !tickers.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded"
              >
                {loading ? 'Fetching...' : '📥 Fetch Transcripts'}
              </button>
            </div>
          </div>
        </div>

        {/* Background Jobs Section */}
        {backgroundJobs.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">🔄 Background Jobs</h2>
            <div className="space-y-4">
              {backgroundJobs.map((job) => (
                <div key={job.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className={`font-semibold ${getJobStatusColor(job.status)}`}>
                        {job.status.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-600 ml-2">
                        {job.tickerCount} tickers
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(job.createdAt).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="mb-2">
                    <div className="text-sm text-gray-600">
                      Progress: {formatProgress(job)}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${job.progress.total > 0 ? (job.progress.current / job.progress.total) * 100 : 0}%` 
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex space-x-2 text-sm text-gray-600 mb-3">
                    <span>✅ {job.processed}</span>
                    <span>❌ {job.failed}</span>
                    <span>⏭️ {job.skipped}</span>
                  </div>

                  {job.currentTicker && (
                    <div className="text-sm text-gray-600 mb-3">
                      Currently processing: <span className="font-mono">{job.currentTicker}</span>
                    </div>
                  )}

                  <div className="flex space-x-2">
                    {job.status === 'running' && (
                      <button
                        onClick={() => handleJobControl(job.id, 'pause')}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm py-1 px-3 rounded"
                      >
                        ⏸️ Pause
                      </button>
                    )}
                    {job.status === 'paused' && (
                      <button
                        onClick={() => handleJobControl(job.id, 'resume')}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-3 rounded"
                      >
                        ▶️ Resume
                      </button>
                    )}
                    {(job.status === 'running' || job.status === 'paused') && (
                      <button
                        onClick={() => handleJobControl(job.id, 'cancel')}
                        className="bg-red-600 hover:bg-red-700 text-white text-sm py-1 px-3 rounded"
                      >
                        ❌ Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Job Progress */}
        {jobProgress && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Current Job Progress</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className={`font-semibold ${getJobStatusColor(jobProgress.status)}`}>
                  {jobProgress.status.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Progress:</span>
                <span>{formatProgress(jobProgress)}</span>
              </div>
              <div className="flex justify-between">
                <span>Processed:</span>
                <span className="text-green-600">{jobProgress.progress.processed.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Failed:</span>
                <span className="text-red-600">{jobProgress.progress.failed.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Skipped:</span>
                <span className="text-yellow-600">{jobProgress.progress.skipped.length}</span>
              </div>
              {jobProgress.progress.currentTicker && (
                <div className="flex justify-between">
                  <span>Current:</span>
                  <span className="font-mono">{jobProgress.progress.currentTicker}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results Section */}
        {results && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">📋 Results</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Successful:</span>
                <span className="text-green-600">{results.summary.successful}</span>
              </div>
              <div className="flex justify-between">
                <span>Failed:</span>
                <span className="text-red-600">{results.summary.failed}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tickers; 