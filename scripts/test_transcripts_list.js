const axios = require('axios');
const fs = require('fs');
const path = require('path');

// API Ninjas configuration
const API_KEY = '+t69rRk12riBxRuAks5IXg==DHao67VBXP6iMzXA';
const API_BASE_URL = 'https://api.api-ninjas.com/v1/earningscalltranscriptslist';

async function testTranscriptsList() {
  try {
    console.log('Testing earningscalltranscriptslist endpoint...\n');
    
    // Test the endpoint
    const response = await axios.get(API_BASE_URL, {
      headers: {
        'X-Api-Key': API_KEY,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    if (response.data) {
      console.log('SUCCESS! API returned data:');
      console.log(`Response type: ${typeof response.data}`);
      console.log(`Is array: ${Array.isArray(response.data)}`);
      console.log(`Data length: ${Array.isArray(response.data) ? response.data.length : 'N/A'}`);
      
      if (Array.isArray(response.data) && response.data.length > 0) {
        console.log('\nFirst 5 entries:');
        response.data.slice(0, 5).forEach((item, index) => {
          console.log(`${index + 1}:`, JSON.stringify(item, null, 2));
        });
        
        // Save to file with proper format
        const outputFile = path.join(__dirname, '..', 'all_tickers_with_data.txt');
        const outputContent = response.data
          .map(item => {
            if (typeof item === 'object' && item.ticker) {
              return `${item.ticker}\t${item.company || item.companyName || 'Unknown'}`;
            } else {
              return item;
            }
          })
          .join('\n');
        
        fs.writeFileSync(outputFile, outputContent);
        console.log(`\nData saved to: ${outputFile}`);
        console.log(`Total entries: ${response.data.length}`);
        
        // Show first 10 entries from the file
        console.log('\nFirst 10 entries from saved file:');
        const lines = outputContent.split('\n').slice(0, 10);
        lines.forEach((line, index) => {
          console.log(`${index + 1}: ${line}`);
        });
      } else {
        console.log('\nResponse data:', JSON.stringify(response.data, null, 2));
      }
    }
    
    return response.data;
  } catch (error) {
    console.log('FAILED! Error accessing endpoint:');
    console.log(`Error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return null;
  }
}

// Run the test
testTranscriptsList().catch(console.error); 