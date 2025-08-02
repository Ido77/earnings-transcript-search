const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Free stock API (Alpha Vantage alternative)
const STOCK_API_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

async function getCompanyName(ticker) {
  try {
    // Use Yahoo Finance API to get company info
    const response = await axios.get(`${STOCK_API_BASE}${ticker}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.data && response.data.chart && response.data.chart.result) {
      const result = response.data.chart.result[0];
      if (result.meta && result.meta.shortName) {
        return result.meta.shortName;
      }
    }
    
    return null;
  } catch (error) {
    console.log(`Failed to get company name for ${ticker}: ${error.message}`);
    return null;
  }
}

async function enhanceTickersFile() {
  const inputFile = path.join(__dirname, '..', 'us_tickers.txt');
  const outputFile = path.join(__dirname, '..', 'us_tickers_with_names.txt');
  
  // Read existing tickers
  const tickers = fs.readFileSync(inputFile, 'utf8')
    .split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  console.log(`Processing ${tickers.length} tickers...`);
  
  const enhancedTickers = [];
  let processed = 0;
  
  // Process in batches to avoid overwhelming the API
  const batchSize = 10;
  
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tickers.length / batchSize)}`);
    
    const promises = batch.map(async (ticker) => {
      const companyName = await getCompanyName(ticker);
      processed++;
      
      if (processed % 50 === 0) {
        console.log(`Processed ${processed}/${tickers.length} tickers`);
      }
      
      return {
        ticker,
        companyName: companyName || 'Unknown'
      };
    });
    
    const results = await Promise.all(promises);
    enhancedTickers.push(...results);
    
    // Add a small delay between batches to be respectful to the API
    if (i + batchSize < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Write enhanced tickers to file
  const outputContent = enhancedTickers
    .map(item => `${item.ticker}\t${item.companyName}`)
    .join('\n');
  
  fs.writeFileSync(outputFile, outputContent);
  
  console.log(`\nEnhanced tickers file created: ${outputFile}`);
  console.log(`Total tickers processed: ${enhancedTickers.length}`);
  
  // Show some statistics
  const withNames = enhancedTickers.filter(item => item.companyName !== 'Unknown').length;
  console.log(`Tickers with company names: ${withNames}`);
  console.log(`Tickers without company names: ${enhancedTickers.length - withNames}`);
  
  // Show first 10 examples
  console.log('\nFirst 10 examples:');
  enhancedTickers.slice(0, 10).forEach(item => {
    console.log(`${item.ticker}\t${item.companyName}`);
  });
}

// Run the script
enhanceTickersFile().catch(console.error); 