const fs = require('fs');
const path = require('path');
const axios = require('axios');

// API Ninjas configuration
const API_KEY = '+t69rRk12riBxRuAks5IXg==DHao67VBXP6iMzXA';
const API_BASE_URL = 'https://api.api-ninjas.com/v1/earningstranscript';

async function getCompanyNameFromTranscript(ticker) {
  try {
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
      // Look for patterns like "Welcome to [Company] Q4" or "[Company] Q4"
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
            return companyName;
          }
        }
      }
      
      // If no pattern match, try to extract from the ticker field
      if (response.data.ticker && response.data.ticker !== ticker.toUpperCase()) {
        return response.data.ticker;
      }
    }
    
    return null;
  } catch (error) {
    if (error.response?.status === 404) {
      // Try with different year/quarter combinations
      const combinations = [
        { year: 2024, quarter: 3 },
        { year: 2024, quarter: 2 },
        { year: 2024, quarter: 1 },
        { year: 2023, quarter: 4 },
        { year: 2023, quarter: 3 }
      ];
      
      for (const combo of combinations) {
        try {
          const retryResponse = await axios.get(API_BASE_URL, {
            params: {
              ticker: ticker.toUpperCase(),
              year: combo.year,
              quarter: combo.quarter
            },
            headers: {
              'X-Api-Key': API_KEY,
              'Accept': 'application/json'
            },
            timeout: 5000
          });
          
          if (retryResponse.data && retryResponse.data.transcript) {
            const transcript = retryResponse.data.transcript;
            const lines = transcript.split('\n').slice(0, 10);
            
            for (const line of lines) {
              const match = line.match(/welcome to\s+([^,\s]+(?:\s+[^,\s]+)*?)\s+q\d/i) ||
                           line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+Q\d/i);
              
              if (match && match[1]) {
                const companyName = match[1].trim();
                if (companyName.length > 2 && 
                    !['the', 'and', 'or', 'for', 'with', 'from', 'this', 'that'].includes(companyName.toLowerCase())) {
                  return companyName;
                }
              }
            }
          }
        } catch (retryError) {
          // Continue to next combination
          continue;
        }
      }
    }
    
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
  
  // Process in smaller batches to avoid overwhelming the API
  const batchSize = 5;
  
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tickers.length / batchSize)}`);
    
    const promises = batch.map(async (ticker) => {
      const companyName = await getCompanyNameFromTranscript(ticker);
      processed++;
      
      if (processed % 20 === 0) {
        console.log(`Processed ${processed}/${tickers.length} tickers`);
      }
      
      return {
        ticker,
        companyName: companyName || 'Unknown'
      };
    });
    
    const results = await Promise.all(promises);
    enhancedTickers.push(...results);
    
    // Add a delay between batches to be respectful to the API
    if (i + batchSize < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
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