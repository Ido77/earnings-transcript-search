const fs = require('fs');
const path = require('path');
const axios = require('axios');

// API Ninjas configuration
const API_KEY = '+t69rRk12riBxRuAks5IXg==DHao67VBXP6iMzXA';
const API_BASE_URL = 'https://api.api-ninjas.com/v1/earningstranscript';

async function getCompanyNameFromTranscript(ticker) {
  try {
    console.log(`Fetching transcript for ${ticker}...`);
    
    // Try to get the most recent transcript (2024 Q4)
    const response = await axios.get(API_BASE_URL, {
      params: {
        ticker: ticker.toUpperCase(),
        year: 2024,
        quarter: 4
      },
      headers: {
        'X-Api-Key': API_KEY,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (response.data && response.data.transcript) {
      // Extract company name from the transcript
      const transcript = response.data.transcript;
      
      // Try to find company name in the first few lines
      const lines = transcript.split('\n').slice(0, 10);
      for (const line of lines) {
        // Look for patterns like "Welcome to Apple Q4" or "Apple Q4"
        const match = line.match(/welcome to\s+([^,\s]+(?:\s+[^,\s]+)*?)\s+q4/i) ||
                     line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+Q4/i) ||
                     line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+Q\d/i);
        
        if (match && match[1]) {
          const companyName = match[1].trim();
          // Filter out common words that aren't company names
          if (companyName.length > 2 && 
              !['the', 'and', 'or', 'for', 'with', 'from', 'this', 'that'].includes(companyName.toLowerCase())) {
            console.log(`Found company name for ${ticker}: ${companyName}`);
            return companyName;
          }
        }
      }
      
      console.log(`No company name pattern found for ${ticker}`);
      return null;
    }
    
    return null;
  } catch (error) {
    console.log(`Failed to get company name for ${ticker}: ${error.message}`);
    return null;
  }
}

async function testEnhanceTickers() {
  // Test with a few popular tickers
  const testTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
  
  console.log('Testing with popular tickers...\n');
  
  const results = [];
  
  for (const ticker of testTickers) {
    const companyName = await getCompanyNameFromTranscript(ticker);
    results.push({
      ticker,
      companyName: companyName || 'Unknown'
    });
    
    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\nResults:');
  results.forEach(item => {
    console.log(`${item.ticker}\t${item.companyName}`);
  });
  
  // Write test results to file
  const outputFile = path.join(__dirname, '..', 'test_tickers_with_names.txt');
  const outputContent = results
    .map(item => `${item.ticker}\t${item.companyName}`)
    .join('\n');
  
  fs.writeFileSync(outputFile, outputContent);
  console.log(`\nTest results written to: ${outputFile}`);
}

// Run the test
testEnhanceTickers().catch(console.error); 