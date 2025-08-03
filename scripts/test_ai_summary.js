#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple test transcript
const testTranscript = {
  id: 'test-2025-Q1',
  ticker: 'TEST',
  year: 2025,
  quarter: 1,
  fullTranscript: `NVIDIA Corporation, Q1 2025 Earnings Call

Jensen Huang (CEO): Thank you everyone for joining us today. We're very excited about our Q1 results. Our data center business continues to show exceptional growth, with revenue increasing 427% year-over-year to $22.6 billion. The AI revolution is accelerating faster than anyone expected.

Lisa Su (Analyst): Jensen, can you elaborate on the data center opportunity?

Jensen Huang: Absolutely. What many investors are missing is the scale of this opportunity. We're not just talking about current AI workloads, but the massive infrastructure buildout that's coming. Every major cloud provider is expanding their AI infrastructure by 10x, and we're positioned to capture this growth.

The market is focused on current quarter results, but they're not seeing the long-term potential. We have visibility into multi-year contracts worth hundreds of billions of dollars. Our customers are planning data center expansions that will require our GPUs for the next 3-5 years.

What's particularly exciting is our competitive moat. Our CUDA platform and software ecosystem create a barrier that's extremely difficult for competitors to replicate. We're not just selling chips - we're selling a complete AI computing platform.

The timing catalyst will be when investors realize that this isn't a cyclical uptick, but a fundamental shift in computing architecture. AI is becoming the primary workload for data centers, and we're the only company positioned to serve this market at scale.`,
  callDate: '2025-01-15'
};

// Save to cache
const cacheFile = path.join(__dirname, '../backend/cache/transcripts.json');
const cacheData = {
  [testTranscript.id]: testTranscript
};

fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
console.log('Test transcript saved to cache');

// Test the summary API
async function testSummary() {
  try {
    console.log('\nTesting AI summary generation...');
    const response = await fetch('http://localhost:3001/api/transcripts/test-2025-Q1/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('\nAI Summary Response:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error testing summary:', error.message);
  }
}

testSummary(); 