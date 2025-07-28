import React from 'react'

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Earnings Call Transcript Search
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Search and analyze earnings call transcripts with powerful keyword and regex search capabilities
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="p-6 border rounded-lg space-y-2">
          <h3 className="text-lg font-semibold">🔍 Advanced Search</h3>
          <p className="text-muted-foreground">
            Search transcripts using keywords, regex patterns, or fuzzy matching
          </p>
        </div>

        <div className="p-6 border rounded-lg space-y-2">
          <h3 className="text-lg font-semibold">📊 Analytics</h3>
          <p className="text-muted-foreground">
            Get insights into search patterns and data coverage
          </p>
        </div>

        <div className="p-6 border rounded-lg space-y-2">
          <h3 className="text-lg font-semibold">📈 Export</h3>
          <p className="text-muted-foreground">
            Export search results and transcripts in multiple formats
          </p>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Get started by searching for transcripts or managing your ticker list
        </p>
      </div>
    </div>
  )
} 