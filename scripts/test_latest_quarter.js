const axios = require('axios');

// API Ninjas configuration
const API_KEY = '+t69rRk12riBxRuAks5IXg==DHao67VBXP6iMzXA';
const API_BASE_URL = 'https://api.api-ninjas.com/v1/earningstranscript';

async function testLatestQuarter() {
  try {
    console.log('Testing API without year/quarter parameters for AAPL...\n');
    
    // Test without year and quarter
    const response = await axios.get(API_BASE_URL, {
      params: {
        ticker: 'AAPL'
      },
      headers: {
        'X-Api-Key': API_KEY,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (response.data) {
      console.log('SUCCESS! API returned data without year/quarter:');
      console.log(`- Ticker: ${response.data.ticker}`);
      console.log(`- Year: ${response.data.year}`);
      console.log(`- Quarter: ${response.data.quarter}`);
      console.log(`- Date: ${response.data.date}`);
      console.log(`- Transcript length: ${response.data.transcript ? response.data.transcript.length : 0} characters`);
      
      // Show first few lines of transcript
      if (response.data.transcript) {
        const lines = response.data.transcript.split('\n').slice(0, 3);
        console.log('\nFirst 3 lines of transcript:');
        lines.forEach((line, index) => {
          console.log(`${index + 1}: ${line}`);
        });
      }
    }
    
    return response.data;
  } catch (error) {
    console.log('FAILED! API requires year and quarter parameters:');
    console.log(`Error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return null;
  }
}

// Run the test
testLatestQuarter().catch(console.error); 