#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Format transcript in the specified format
 */
function formatTranscript(transcriptData) {
  const { ticker, year, quarter, fullTranscript, callDate } = transcriptData;
  
  // Get company name
  const companyName = 'NVIDIA Corporation';
  
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
 * Main function
 */
async function main() {
  console.log('Formatting NVIDIA Q1 2025 transcript...');

  // Fetch the transcript from the API
  try {
    const response = await fetch('http://localhost:3001/api/transcripts/nvda-2025-Q1');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const transcript = await response.json();
    
    // Format the transcript
    const formatted = formatTranscript({
      ticker: 'NVDA',
      year: 2025,
      quarter: 1,
      fullTranscript: transcript.fullTranscript,
      callDate: transcript.callDate
    });

    // Save to file
    const outputPath = path.join(__dirname, '../formatted_transcripts/NVIDIA_Q1_2025_formatted.txt');
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, formatted);
    console.log(`Formatted transcript saved to: ${outputPath}`);
    
    // Display first 1000 characters as preview
    console.log('\n--- Preview ---');
    console.log(formatted.substring(0, 1000) + '...');
    
  } catch (error) {
    console.error('Error processing transcript:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { formatTranscript }; 