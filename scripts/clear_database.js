#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Clear all transcripts from the database
 */
async function clearDatabase() {
  console.log('🗄️  Clearing database transcripts...');
  
  try {
    // Get count before clearing
    const countBefore = await prisma.transcript.count();
    console.log(`📊 Found ${countBefore} transcripts in database`);
    
    if (countBefore === 0) {
      console.log('✅ Database is already empty');
      return;
    }
    
    // Clear all transcripts
    const result = await prisma.transcript.deleteMany({});
    
    console.log(`✅ Successfully deleted ${result.count} transcripts from database`);
    console.log('💡 Database is now empty and ready for new transcripts');
    
  } catch (error) {
    console.error('❌ Error clearing database:', error.message);
    throw error;
  }
}

/**
 * Get database statistics
 */
async function getStats() {
  try {
    const transcriptCount = await prisma.transcript.count();
    const companyCount = await prisma.company.count();
    const searchLogCount = await prisma.searchLog.count();
    const fetchJobCount = await prisma.fetchJob.count();
    
    console.log('📊 Database Statistics:');
    console.log(`   Transcripts: ${transcriptCount}`);
    console.log(`   Companies: ${companyCount}`);
    console.log(`   Search Logs: ${searchLogCount}`);
    console.log(`   Fetch Jobs: ${fetchJobCount}`);
    
  } catch (error) {
    console.error('❌ Error getting stats:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.length === 0 || args[0] === 'clear') {
      await clearDatabase();
    } else if (args[0] === 'stats') {
      await getStats();
    } else {
      console.log('Usage:');
      console.log('  node scripts/clear_database.js        # Clear all transcripts');
      console.log('  node scripts/clear_database.js clear  # Clear all transcripts');
      console.log('  node scripts/clear_database.js stats  # Show database statistics');
    }
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
} 