const fs = require('fs');
const path = require('path');
const axios = require('axios');

// API Ninjas configuration
const API_KEY = '+t69rRk12riBxRuAks5IXg==DHao67VBXP6iMzXA';
const API_BASE_URL = 'https://api.api-ninjas.com/v1/earningstranscript';

// Common company names mapping for popular tickers
const KNOWN_COMPANIES = {
  'AAPL': 'Apple Inc.',
  'MSFT': 'Microsoft Corporation',
  'GOOGL': 'Alphabet Inc.',
  'AMZN': 'Amazon.com Inc.',
  'TSLA': 'Tesla Inc.',
  'META': 'Meta Platforms Inc.',
  'NVDA': 'NVIDIA Corporation',
  'BRK-B': 'Berkshire Hathaway Inc.',
  'UNH': 'UnitedHealth Group Inc.',
  'JNJ': 'Johnson & Johnson',
  'JPM': 'JPMorgan Chase & Co.',
  'V': 'Visa Inc.',
  'PG': 'Procter & Gamble Co.',
  'HD': 'Home Depot Inc.',
  'MA': 'Mastercard Inc.',
  'NFLX': 'Netflix Inc.',
  'DIS': 'Walt Disney Co.',
  'PYPL': 'PayPal Holdings Inc.',
  'ADBE': 'Adobe Inc.',
  'CRM': 'Salesforce Inc.'
};

async function getCompanyNameFromTranscript(ticker) {
  // First check if we have a known company name
  if (KNOWN_COMPANIES[ticker.toUpperCase()]) {
    return KNOWN_COMPANIES[ticker.toUpperCase()];
  }

  // Try to get transcript from most recent quarters
  const quartersToTry = [
    { year: 2024, quarter: 4 },
    { year: 2024, quarter: 3 },
    { year: 2024, quarter: 2 },
    { year: 2024, quarter: 1 },
    { year: 2023, quarter: 4 },
    { year: 2023, quarter: 3 },
    { year: 2023, quarter: 2 },
    { year: 2023, quarter: 1 }
  ];

  for (const { year, quarter } of quartersToTry) {
    try {
      const response = await axios.get(API_BASE_URL, {
        params: {
          ticker: ticker.toUpperCase(),
          year,
          quarter
        },
        headers: {
          'X-Api-Key': API_KEY,
          'Accept': 'application/json'
        },
        timeout: 5000
      });

      if (response.data && response.data.transcript) {
        const transcript = response.data.transcript;
        
        // Look for company name in the first few lines
        const lines = transcript.split('\n').slice(0, 15);
        
        for (const line of lines) {
          // Try multiple patterns to extract company name
          const patterns = [
            /welcome to\s+([^,\s]+(?:\s+[^,\s]+)*?)\s+q\d/i,
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+Q\d\s+.*?earnings/i,
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+.*?earnings\s+call/i,
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+.*?conference\s+call/i
          ];
          
          for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match && match[1]) {
              const companyName = match[1].trim();
              
              // Filter out common words and phrases
              const invalidWords = [
                'the', 'and', 'or', 'for', 'with', 'from', 'this', 'that', 'our', 'we', 'delivered', 
                'strong', 'quarter', 'earnings', 'call', 'conference', 'welcome', 'good', 'afternoon',
                'morning', 'everyone', 'thanks', 'joining', 'today', 'reporting', 'revenue', 'billion'
              ];
              
              if (companyName.length > 2 && 
                  !invalidWords.includes(companyName.toLowerCase()) &&
                  !companyName.toLowerCase().includes('quarter') &&
                  !companyName.toLowerCase().includes('earnings') &&
                  !companyName.toLowerCase().includes('call')) {
                return companyName;
              }
            }
          }
        }
      }
    } catch (error) {
      // Continue to next quarter if this one fails
      continue;
    }
  }
  
  return null;
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
  
  // Process in smaller batches
  const batchSize = 3;
  
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tickers.length / batchSize)}`);
    
    const promises = batch.map(async (ticker) => {
      const companyName = await getCompanyNameFromTranscript(ticker);
      processed++;
      
      if (processed % 30 === 0) {
        console.log(`Processed ${processed}/${tickers.length} tickers`);
      }
      
      return {
        ticker,
        companyName: companyName || 'Unknown'
      };
    });
    
    const results = await Promise.all(promises);
    enhancedTickers.push(...results);
    
    // Add delay between batches
    if (i + batchSize < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Write enhanced tickers to file
  const outputContent = enhancedTickers
    .map(item => `${item.ticker}\t${item.companyName}`)
    .join('\n');
  
  fs.writeFileSync(outputFile, outputContent);
  
  console.log(`\nEnhanced tickers file created: ${outputFile}`);
  console.log(`Total tickers processed: ${enhancedTickers.length}`);
  
  // Show statistics
  const withNames = enhancedTickers.filter(item => item.companyName !== 'Unknown').length;
  console.log(`Tickers with company names: ${withNames}`);
  console.log(`Tickers without company names: ${enhancedTickers.length - withNames}`);
  
  // Show first 20 examples
  console.log('\nFirst 20 examples:');
  enhancedTickers.slice(0, 20).forEach(item => {
    console.log(`${item.ticker}\t${item.companyName}`);
  });
}

// Run the script
enhanceTickersFile().catch(console.error); 