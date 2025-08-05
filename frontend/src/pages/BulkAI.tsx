import React, { useState, useEffect, useCallback } from 'react';

interface BulkAIJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    current: number;
    total: number;
    currentTranscript?: string;
    processed: string[];
    failed: string[];
    skipped: string[];
  };
  results: Array<{
    transcriptId: string;
    ticker: string;
    year: number;
    quarter: number;
    status: 'success' | 'failed' | 'skipped';
    summariesGenerated: number;
    error?: string;
    processingTime?: number;
  }>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  estimatedTimeRemaining?: number;
  error?: string;
}

interface BulkAIStats {
  totalJobs: number;
  activeJobs: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalTranscriptsProcessed: number;
  totalSummariesGenerated: number;
}

export default function BulkAI() {
  const [jobs, setJobs] = useState<BulkAIJob[]>([]);
  const [stats, setStats] = useState<BulkAIStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [selectedTickers, setSelectedTickers] = useState<string>('');
  const [forceRefresh, setForceRefresh] = useState(false);
  const [selectedAnalysts, setSelectedAnalysts] = useState({
    Claude: true,
    Gemini: true,
    DeepSeek: true,
    Grok: true
  });

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/ai/bulk-process');
      const data = await response.json();
      
      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/ai/bulk-stats');
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchJobs();
    fetchStats();
  }, [fetchJobs, fetchStats]);

  const startBulkProcessing = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const tickers = selectedTickers
        .split(',')
        .map(t => t.trim().toUpperCase())
        .filter(t => t.length > 0);

      const analystTypes = Object.entries(selectedAnalysts)
        .filter(([_, selected]) => selected)
        .map(([analyst, _]) => analyst);

      if (tickers.length === 0) {
        throw new Error('Please enter at least one ticker');
      }

      if (analystTypes.length === 0) {
        throw new Error('Please select at least one analyst type');
      }

      const response = await fetch('http://localhost:3001/api/ai/bulk-process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tickers,
          analystTypes,
          forceRefresh
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(`Bulk AI processing started! Job ID: ${data.jobId}`);
        fetchJobs();
        fetchStats();
      } else {
        throw new Error(data.details || 'Failed to start bulk processing');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">🧠 Bulk AI Processing</h1>
      <p className="text-gray-600 mb-8">
        Process multiple transcripts with AI analysis in parallel. Generate summaries from Claude, Gemini, DeepSeek, and Grok.
      </p>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-blue-600">{stats.totalJobs}</div>
            <div className="text-sm text-gray-500">Total Jobs</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-green-600">{stats.completedJobs}</div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-orange-600">{stats.activeJobs}</div>
            <div className="text-sm text-gray-500">Active</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-2xl font-bold text-purple-600">{stats.totalSummariesGenerated}</div>
            <div className="text-sm text-gray-500">AI Summaries</div>
          </div>
        </div>
      )}

      {/* Start Processing Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Start Bulk AI Processing</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tickers (comma-separated)
            </label>
            <input
              type="text"
              value={selectedTickers}
              onChange={(e) => setSelectedTickers(e.target.value)}
              placeholder="e.g., AAPL, MSFT, GOOGL, BAX"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select AI Analysts
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(selectedAnalysts).map(([analyst, selected]) => (
                <label key={analyst} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => setSelectedAnalysts(prev => ({
                      ...prev,
                      [analyst]: e.target.checked
                    }))}
                    className="rounded"
                  />
                  <span className="text-sm">{analyst}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="forceRefresh"
              checked={forceRefresh}
              onChange={(e) => setForceRefresh(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="forceRefresh" className="text-sm text-gray-700">
              Force refresh (regenerate existing summaries)
            </label>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            onClick={startBulkProcessing}
            disabled={isLoading}
            className={`w-full py-2 px-4 rounded-md text-white font-medium ${
              isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Starting...' : 'Start Bulk AI Processing'}
          </button>
        </div>
      </div>

      {/* Jobs List */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Jobs</h2>
        
        {jobs.length === 0 ? (
          <p className="text-gray-500">No jobs found. Start your first bulk AI processing above.</p>
        ) : (
          <div className="space-y-4">
            {jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium">Job {job.id}</div>
                    <div className="text-sm text-gray-500">
                      Created: {new Date(job.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    job.status === 'completed' ? 'bg-green-100 text-green-800' :
                    job.status === 'running' ? 'bg-blue-100 text-blue-800' :
                    job.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {job.status}
                  </span>
                </div>
                
                <div className="text-sm text-gray-600">
                  Progress: {job.progress.current}/{job.progress.total} transcripts
                  {job.progress.currentTranscript && (
                    <span> (Current: {job.progress.currentTranscript})</span>
                  )}
                </div>
                
                {job.progress.total > 0 && (
                  <div className="mt-2">
                    <div className="bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(job.progress.current / job.progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}