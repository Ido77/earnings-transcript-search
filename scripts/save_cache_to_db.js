#!/usr/bin/env node

/**
 * Script to save cached transcripts to database
 * This fixes the issue where transcripts were only stored in memory cache
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function saveCacheToDatabase() {
  try {
    console.log('🔍 Looking for cached transcripts...');
    
    // Check if there are any cache files
    const cacheDir = path.join(__dirname, '../backend/cache');
    const transcriptsCacheFile = path.join(cacheDir, 'transcripts.json');
    
    if (fs.existsSync(transcriptsCacheFile)) {
      const cacheContent = fs.readFileSync(transcriptsCacheFile, 'utf8');
      const cache = JSON.parse(cacheContent);
      
      console.log(`📦 Found ${Object.keys(cache).length} items in cache`);
      
      let savedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      for (const [cacheKey, transcript] of Object.entries(cache)) {
        try {
          if (!transcript.ticker || !transcript.year || !transcript.quarter || !transcript.fullTranscript) {
            console.log(`⚠️  Skipping ${cacheKey} - missing required fields`);
            skippedCount++;
            continue;
          }
          
          // Parse call date
          let callDate = null;
          if (transcript.callDate) {
            try {
              callDate = new Date(transcript.callDate);
            } catch (error) {
              console.log(`⚠️  Invalid date for ${cacheKey}: ${transcript.callDate}`);
            }
          }
          
          // Save to database
          const savedTranscript = await prisma.transcript.upsert({
            where: {
              ticker_year_quarter: {
                ticker: transcript.ticker.toUpperCase(),
                year: transcript.year,
                quarter: transcript.quarter,
              },
            },
            update: {
              fullTranscript: transcript.fullTranscript,
              callDate,
              updatedAt: new Date(),
            },
            create: {
              ticker: transcript.ticker.toUpperCase(),
              year: transcript.year,
              quarter: transcript.quarter,
              fullTranscript: transcript.fullTranscript,
              callDate,
              transcriptJson: transcript.transcriptJson || {},
            },
          });
          
          console.log(`✅ Saved ${transcript.ticker.toUpperCase()} ${transcript.year}Q${transcript.quarter} to database`);
          savedCount++;
          
        } catch (error) {
          console.error(`❌ Error saving ${cacheKey}:`, error.message);
          errorCount++;
        }
      }
      
      console.log(`\n📊 Summary:`);
      console.log(`   ✅ Saved: ${savedCount}`);
      console.log(`   ⚠️  Skipped: ${skippedCount}`);
      console.log(`   ❌ Errors: ${errorCount}`);
      
    } else {
      console.log('📦 No transcripts cache file found');
    }
    
    // Also check if we can access the in-memory cache via the backend API
    console.log('\n🌐 Checking for FTNT via API...');
    
    try {
      const response = await fetch('http://localhost:3001/api/tickers?search=FTNT');
      const result = await response.json();
      
      if (result.tickers && result.tickers.length > 0) {
        console.log('✅ FTNT found in database via API');
      } else {
        console.log('⚠️  FTNT not found in database yet');
        
        // Try to trigger a database save by running a bulk AI job for FTNT
        console.log('🤖 Attempting to trigger database save via bulk AI...');
        
        const bulkAIResponse = await fetch('http://localhost:3001/api/ai/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tickers: ['FTNT'],
            analystTypes: ['business'], // Just one to minimize processing
            mode: 'development'
          }),
        });
        
        if (bulkAIResponse.ok) {
          const bulkResult = await bulkAIResponse.json();
          console.log('✅ Bulk AI job started:', bulkResult.jobId);
          console.log('⏳ This should save FTNT transcript from cache to database');
        } else {
          console.log('❌ Failed to start bulk AI job');
        }
      }
    } catch (error) {
      console.log('❌ Error checking API:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle fetch for Node.js environments
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

saveCacheToDatabase().catch(console.error);