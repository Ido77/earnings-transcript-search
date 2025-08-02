#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Clear all transcript data while preserving backups
 */
function clearTranscripts() {
  const cacheDir = path.join(__dirname, '../backend/cache');
  const backupDir = path.join(__dirname, '../backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  console.log('🧹 Clearing transcript cache...');
  console.log('📁 Cache directory:', cacheDir);
  console.log('💾 Backup directory:', backupDir);
  
  // Create backup directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log('✅ Created backup directory');
  }
  
  // Files to backup and clear
  const filesToBackup = [
    'transcripts.json',
    'jobs.json',
    'chunks'
  ];
  
  let totalBackedUp = 0;
  let totalCleared = 0;
  
  for (const file of filesToBackup) {
    const sourcePath = path.join(cacheDir, file);
    const backupPath = path.join(backupDir, `${file}_${timestamp}`);
    
    if (fs.existsSync(sourcePath)) {
      try {
        if (fs.statSync(sourcePath).isDirectory()) {
          // Handle directory (chunks)
          if (fs.existsSync(backupPath)) {
            fs.rmSync(backupPath, { recursive: true, force: true });
          }
          fs.cpSync(sourcePath, backupPath, { recursive: true });
          fs.rmSync(sourcePath, { recursive: true, force: true });
          console.log(`✅ Backed up and cleared directory: ${file}`);
        } else {
          // Handle file
          fs.copyFileSync(sourcePath, backupPath);
          fs.unlinkSync(sourcePath);
          console.log(`✅ Backed up and cleared file: ${file}`);
        }
        totalBackedUp++;
        totalCleared++;
      } catch (error) {
        console.error(`❌ Error processing ${file}:`, error.message);
      }
    } else {
      console.log(`⚠️  File/directory not found: ${file}`);
    }
  }
  
  // Create empty files/directories to maintain structure
  try {
    // Create empty transcripts.json
    fs.writeFileSync(path.join(cacheDir, 'transcripts.json'), '{}');
    console.log('✅ Created empty transcripts.json');
    
    // Create empty jobs.json
    fs.writeFileSync(path.join(cacheDir, 'jobs.json'), '{}');
    console.log('✅ Created empty jobs.json');
    
    // Create chunks directory
    const chunksDir = path.join(cacheDir, 'chunks');
    if (!fs.existsSync(chunksDir)) {
      fs.mkdirSync(chunksDir, { recursive: true });
      console.log('✅ Created empty chunks directory');
    }
    
    totalCleared++;
  } catch (error) {
    console.error('❌ Error creating empty files:', error.message);
  }
  
  // Show backup location
  console.log('\n📊 Summary:');
  console.log(`   Files backed up: ${totalBackedUp}`);
  console.log(`   Items cleared: ${totalCleared}`);
  console.log(`   Backup location: ${backupDir}`);
  console.log(`   Backup timestamp: ${timestamp}`);
  
  console.log('\n🎉 Transcript cache cleared successfully!');
  console.log('💡 Your transcript data is safely backed up and can be restored if needed.');
  console.log('🚀 You can now start fresh with your new batch of transcripts.');
}

/**
 * Clear memory cache by restarting the backend
 */
function restartBackend() {
  console.log('\n🔄 Restarting backend to clear memory cache...');
  
  try {
    // Kill existing backend processes
    console.log('   Stopping backend processes...');
    execSync('pkill -f "node.*backend"', { stdio: 'inherit' });
    
    // Wait a moment
    console.log('   Waiting for processes to stop...');
    execSync('sleep 2', { stdio: 'inherit' });
    
    // Start backend in background
    console.log('   Starting backend...');
    execSync('cd backend && npm run dev', { stdio: 'inherit', detached: true });
    
    console.log('✅ Backend restarted successfully!');
    console.log('💡 Memory cache has been cleared.');
    
  } catch (error) {
    console.error('❌ Error restarting backend:', error.message);
    console.log('💡 You may need to manually restart the backend.');
  }
}

/**
 * Complete clear operation
 */
function completeClear() {
  clearTranscripts();
  restartBackend();
  
  console.log('\n🎯 Complete clear operation finished!');
  console.log('📝 Next steps:');
  console.log('   1. Wait for backend to fully start (check with ./check-status.sh)');
  console.log('   2. Go to http://localhost:3000/tickers');
  console.log('   3. Upload your ticker file and start processing');
  console.log('   4. Your search will now be empty until new transcripts are loaded');
}

/**
 * Restore transcripts from backup (if needed)
 */
function restoreTranscripts(backupTimestamp) {
  const cacheDir = path.join(__dirname, '../backend/cache');
  const backupDir = path.join(__dirname, '../backups');
  
  if (!backupTimestamp) {
    console.log('❌ Please provide a backup timestamp');
    console.log('💡 Available backups:');
    const backups = fs.readdirSync(backupDir).filter(file => 
      file.includes('transcripts.json_') || 
      file.includes('jobs.json_') || 
      file.includes('chunks_')
    );
    
    const timestamps = [...new Set(backups.map(file => {
      const parts = file.split('_');
      return parts.slice(-2).join('_'); // Get timestamp part
    }))];
    
    timestamps.forEach(timestamp => {
      console.log(`   ${timestamp}`);
    });
    return;
  }
  
  console.log(`🔄 Restoring from backup: ${backupTimestamp}`);
  
  const filesToRestore = [
    'transcripts.json',
    'jobs.json',
    'chunks'
  ];
  
  let restored = 0;
  
  for (const file of filesToRestore) {
    const backupPath = path.join(backupDir, `${file}_${backupTimestamp}`);
    const restorePath = path.join(cacheDir, file);
    
    if (fs.existsSync(backupPath)) {
      try {
        if (fs.statSync(backupPath).isDirectory()) {
          if (fs.existsSync(restorePath)) {
            fs.rmSync(restorePath, { recursive: true, force: true });
          }
          fs.cpSync(backupPath, restorePath, { recursive: true });
        } else {
          fs.copyFileSync(backupPath, restorePath);
        }
        console.log(`✅ Restored: ${file}`);
        restored++;
      } catch (error) {
        console.error(`❌ Error restoring ${file}:`, error.message);
      }
    } else {
      console.log(`⚠️  Backup not found: ${file}_${backupTimestamp}`);
    }
  }
  
  console.log(`\n🎉 Restored ${restored} items from backup: ${backupTimestamp}`);
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Complete clear operation
    completeClear();
  } else if (args[0] === 'files-only') {
    // Clear only files (no restart)
    clearTranscripts();
  } else if (args[0] === 'restart-only') {
    // Restart only
    restartBackend();
  } else if (args[0] === 'restore' && args[1]) {
    // Restore from backup
    restoreTranscripts(args[1]);
  } else if (args[0] === 'restore') {
    // Show available backups
    restoreTranscripts();
  } else {
    console.log('Usage:');
    console.log('  node scripts/clear_transcripts.js                    # Complete clear (files + restart)');
    console.log('  node scripts/clear_transcripts.js files-only         # Clear files only');
    console.log('  node scripts/clear_transcripts.js restart-only       # Restart backend only');
    console.log('  node scripts/clear_transcripts.js restore            # Show available backups');
    console.log('  node scripts/clear_transcripts.js restore TIMESTAMP  # Restore from backup');
  }
} 