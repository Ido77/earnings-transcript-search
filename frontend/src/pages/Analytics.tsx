import React from 'react'

export default function Analytics() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          View system statistics and usage analytics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 border rounded-lg">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Total Transcripts</p>
            <p className="text-3xl font-bold">0</p>
          </div>
        </div>

        <div className="p-6 border rounded-lg">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Unique Tickers</p>
            <p className="text-3xl font-bold">0</p>
          </div>
        </div>

        <div className="p-6 border rounded-lg">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Total Searches</p>
            <p className="text-3xl font-bold">0</p>
          </div>
        </div>

        <div className="p-6 border rounded-lg">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Avg Response Time</p>
            <p className="text-3xl font-bold">0ms</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Search Activity</h3>
          <p className="text-muted-foreground">Chart would be displayed here...</p>
        </div>

        <div className="p-6 border rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Data Coverage</h3>
          <p className="text-muted-foreground">Coverage matrix would be displayed here...</p>
        </div>
      </div>
    </div>
  )
} 