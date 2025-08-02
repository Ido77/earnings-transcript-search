#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Format transcript in the specified format
 * @param {Object} transcriptData - Raw transcript data
 * @returns {string} - Formatted transcript
 */
function formatTranscript(transcriptData) {
  const { ticker, year, quarter, fullTranscript, callDate } = transcriptData;
  
  // Get company name (you might want to maintain a mapping of ticker to company names)
  const companyNames = {
    'NVDA': 'NVIDIA Corporation',
    'AAPL': 'Apple Inc.',
    'MSFT': 'Microsoft Corporation',
    'GOOGL': 'Alphabet Inc.',
    'TSLA': 'Tesla, Inc.',
    'AMZN': 'Amazon.com, Inc.',
    'META': 'Meta Platforms, Inc.',
    'NFLX': 'Netflix, Inc.',
    'DIS': 'The Walt Disney Company',
    'JPM': 'JPMorgan Chase & Co.',
    'JNJ': 'Johnson & Johnson',
    'PG': 'The Procter & Gamble Company',
    'HD': 'The Home Depot, Inc.',
    'V': 'Visa Inc.',
    'MA': 'Mastercard Incorporated',
    'UNH': 'UnitedHealth Group Incorporated',
    'BRK-B': 'Berkshire Hathaway Inc.',
    'CRM': 'Salesforce, Inc.',
    'ADBE': 'Adobe Inc.',
    'PYPL': 'PayPal Holdings, Inc.',
    'CMCSA': 'Comcast Corporation',
    'PEP': 'PepsiCo, Inc.',
    'TMO': 'Thermo Fisher Scientific Inc.',
    'ABT': 'Abbott Laboratories',
    'COST': 'Costco Wholesale Corporation',
    'ACN': 'Accenture plc',
    'MRK': 'Merck & Co., Inc.',
    'DHR': 'Danaher Corporation',
    'VZ': 'Verizon Communications Inc.',
    'NKE': 'NIKE, Inc.'
  };

  const companyName = companyNames[ticker.toUpperCase()] || `${ticker.toUpperCase()} Corporation`;
  
  // Format the date
  let formattedDate = '';
  if (callDate) {
    const date = new Date(callDate);
    formattedDate = date.toLocaleDateString('en-US', { 
      month: 'numeric', 
      day: 'numeric', 
      year: '2-digit' 
    });
  }

  // Create header
  const header = `${companyName}, Q${quarter} ${year} Earnings Call, ${callDate ? new Date(callDate).toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  }) : 'Date TBD'}`;
  
  const dateLine = formattedDate || 'Date TBD';
  
  // Format the transcript content
  let formattedContent = fullTranscript;
  
  // If the transcript has speaker information, format it properly
  if (fullTranscript.includes(':')) {
    // Split by lines and format each speaker section
    const lines = fullTranscript.split('\n');
    const formattedLines = lines.map(line => {
      if (line.includes(':')) {
        const [speaker, ...textParts] = line.split(':');
        const text = textParts.join(':').trim();
        if (text) {
          return `${speaker.trim()}\n\n${text}`;
        }
      }
      return line;
    });
    formattedContent = formattedLines.join('\n\n');
  }

  // Combine everything
  const formattedTranscript = `${header}\n${dateLine}\n\n${formattedContent}`;
  
  return formattedTranscript;
}

/**
 * Main function to process a transcript file
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node format_transcript.js <ticker> [year] [quarter]');
    console.log('Example: node format_transcript.js NVDA 2025 1');
    process.exit(1);
  }

  const ticker = args[0].toUpperCase();
  const year = args[1] || '2025';
  const quarter = args[2] || '1';

  console.log(`Formatting transcript for ${ticker} Q${quarter} ${year}...`);

  // Try to find the transcript in the cache
  const cachePath = path.join(__dirname, '../backend/cache/transcripts.json');
  
  if (!fs.existsSync(cachePath)) {
    console.error('Transcript cache not found. Please ensure transcripts are cached first.');
    process.exit(1);
  }

  try {
    // Read the cache file and find the specific transcript
    const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    
    const transcriptKey = `${ticker.toLowerCase()}-${year}-Q${quarter}`;
    const transcript = cacheData[transcriptKey];
    
    // If not found in transcripts.json, try to fetch from API
    if (!transcript) {
      console.log(`Transcript not found in cache, trying to fetch from API...`);
      try {
        const response = await fetch(`http://localhost:3001/api/transcripts/${transcriptKey}`);
        if (response.ok) {
          const apiTranscript = await response.json();
          return formatTranscript({
            ticker,
            year: parseInt(year),
            quarter: parseInt(quarter),
            fullTranscript: apiTranscript.fullTranscript,
            callDate: apiTranscript.callDate
          });
        }
      } catch (error) {
        console.error('Failed to fetch from API:', error.message);
      }
    }
    
    if (!transcript) {
      console.error(`Transcript not found for ${ticker} Q${quarter} ${year}`);
      console.log('Available transcripts:');
      Object.keys(cacheData).slice(0, 10).forEach(key => console.log(`  ${key}`));
      process.exit(1);
    }

    // Format the transcript
    const formatted = formatTranscript({
      ticker,
      year: parseInt(year),
      quarter: parseInt(quarter),
      fullTranscript: transcript.fullTranscript,
      callDate: transcript.callDate
    });

    // Save to file
    const outputPath = path.join(__dirname, `../formatted_transcripts/${ticker}_Q${quarter}_${year}_formatted.txt`);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, formatted);
    console.log(`Formatted transcript saved to: ${outputPath}`);
    
    // Also display first 500 characters
    console.log('\n--- Preview ---');
    console.log(formatted.substring(0, 500) + '...');
    
  } catch (error) {
    console.error('Error processing transcript:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { formatTranscript }; 