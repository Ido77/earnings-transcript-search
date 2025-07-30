const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'cache/transcripts.json');

console.log('Testing large cache file parsing...');

try {
  const stats = fs.statSync(CACHE_FILE);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
  
  console.log('Reading file...');
  const data = fs.readFileSync(CACHE_FILE, 'utf8');
  console.log(`Read ${data.length} characters`);
  
  console.log('Parsing JSON...');
  const cacheData = JSON.parse(data);
  console.log(`Parsed successfully!`);
  console.log(`Total entries: ${Object.keys(cacheData).length}`);
  
  // Count unique tickers
  const tickers = new Set();
  for (const key of Object.keys(cacheData)) {
    const ticker = key.split('-')[0];
    tickers.add(ticker);
  }
  console.log(`Unique tickers: ${tickers.size}`);
  
  // Show first few tickers
  const tickerArray = Array.from(tickers).sort();
  console.log(`First 10 tickers: ${tickerArray.slice(0, 10).join(', ')}`);
  
} catch (error) {
  console.error('Error:', error.message);
} 