const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'cache/transcripts.json');
const CACHE_DIR = path.join(__dirname, 'cache/chunks');

// Create chunks directory
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

console.log('Reading large cache file...');
const data = fs.readFileSync(CACHE_FILE, 'utf8');

console.log('Parsing JSON entries...');
const lines = data.split('\n');
let currentChunk = {};
let chunkIndex = 0;
let entriesInChunk = 0;
const MAX_ENTRIES_PER_CHUNK = 100; // Smaller chunks

let currentEntry = '';
let inEntry = false;
let braceCount = 0;
let totalEntries = 0;

for (const line of lines) {
  if (line.trim().startsWith('"') && line.includes(': {')) {
    // Start of new entry
    inEntry = true;
    currentEntry = line;
    braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
  } else if (inEntry) {
    currentEntry += '\n' + line;
    braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    
    // Check if entry is complete
    if (braceCount <= 0 && line.trim().endsWith('},')) {
      try {
        // Parse this individual entry
        const entryJson = '{' + currentEntry.replace(/,$/, '') + '}';
        const parsed = JSON.parse(entryJson);
        const key = Object.keys(parsed)[0];
        const value = parsed[key];
        
        if (key && value) {
          currentChunk[key] = value;
          entriesInChunk++;
          totalEntries++;
          
          // Save chunk when it reaches max size
          if (entriesInChunk >= MAX_ENTRIES_PER_CHUNK) {
            const chunkFile = path.join(CACHE_DIR, `chunk_${chunkIndex.toString().padStart(4, '0')}.json`);
            fs.writeFileSync(chunkFile, JSON.stringify(currentChunk, null, 2));
            console.log(`Saved chunk ${chunkIndex} with ${entriesInChunk} entries`);
            
            currentChunk = {};
            entriesInChunk = 0;
            chunkIndex++;
          }
        }
      } catch (parseError) {
        console.log('Parse error for entry, skipping...');
      }
      
      inEntry = false;
      currentEntry = '';
      braceCount = 0;
    }
  }
}

// Save remaining entries
if (entriesInChunk > 0) {
  const chunkFile = path.join(CACHE_DIR, `chunk_${chunkIndex.toString().padStart(4, '0')}.json`);
  fs.writeFileSync(chunkFile, JSON.stringify(currentChunk, null, 2));
  console.log(`Saved final chunk ${chunkIndex} with ${entriesInChunk} entries`);
}

console.log(`\nSplit complete!`);
console.log(`Total entries processed: ${totalEntries}`);
console.log(`Total chunks created: ${chunkIndex + 1}`);
console.log(`Chunks saved in: ${CACHE_DIR}`); 