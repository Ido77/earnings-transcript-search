const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'cache/transcripts.json');
const CHUNKS_DIR = path.join(__dirname, 'cache/chunks');

console.log('Splitting large cache file into manageable chunks...');

// Create chunks directory
if (!fs.existsSync(CHUNKS_DIR)) {
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });
}

try {
  const stats = fs.statSync(CACHE_FILE);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
  
  // Read the file in chunks to avoid memory issues
  const stream = fs.createReadStream(CACHE_FILE, { encoding: 'utf8' });
  let data = '';
  let chunkIndex = 0;
  let currentChunk = {};
  let entriesInChunk = 0;
  const MAX_ENTRIES_PER_CHUNK = 200; // Smaller chunks
  
  stream.on('data', (chunk) => {
    data += chunk;
  });
  
  stream.on('end', () => {
    console.log('File read, now parsing...');
    
    try {
      // Parse the JSON
      const cacheData = JSON.parse(data);
      const entries = Object.entries(cacheData);
      
      console.log(`Total entries: ${entries.length}`);
      
      // Split into chunks
      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];
        
        currentChunk[key] = value;
        entriesInChunk++;
        
        // Save chunk when it reaches max size
        if (entriesInChunk >= MAX_ENTRIES_PER_CHUNK) {
          const chunkFile = path.join(CHUNKS_DIR, `chunk_${chunkIndex.toString().padStart(4, '0')}.json`);
          fs.writeFileSync(chunkFile, JSON.stringify(currentChunk, null, 2));
          console.log(`Saved chunk ${chunkIndex} with ${entriesInChunk} entries`);
          
          currentChunk = {};
          entriesInChunk = 0;
          chunkIndex++;
        }
      }
      
      // Save remaining entries
      if (entriesInChunk > 0) {
        const chunkFile = path.join(CHUNKS_DIR, `chunk_${chunkIndex.toString().padStart(4, '0')}.json`);
        fs.writeFileSync(chunkFile, JSON.stringify(currentChunk, null, 2));
        console.log(`Saved final chunk ${chunkIndex} with ${entriesInChunk} entries`);
      }
      
      console.log(`\nSplit complete!`);
      console.log(`Total entries processed: ${entries.length}`);
      console.log(`Total chunks created: ${chunkIndex + 1}`);
      console.log(`Chunks saved in: ${CHUNKS_DIR}`);
      
    } catch (parseError) {
      console.error('JSON parsing failed:', parseError.message);
    }
  });
  
  stream.on('error', (error) => {
    console.error('Error reading file:', error.message);
  });
  
} catch (error) {
  console.error('Error:', error.message);
} 