#!/usr/bin/env node
/**
 * Batch processor for Clerk to Audienceful sync
 * Processes users in small batches to avoid timeouts
 * 
 * Usage:
 *   node scripts/sync-clerk-audienceful-batch.js [--batch-size=N] [--start-offset=N]
 */

const MIGRATION_KEY = process.env.MIGRATION_KEY || 'fQgP7eDlvu5+aDSdVGgQevKaOx7vabbod6qG006tLQU=';
const BASE_URL = 'https://app.harvous.com';
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '10');
const START_OFFSET = parseInt(process.argv.find(arg => arg.startsWith('--start-offset='))?.split('=')[1] || '0');

let totalProcessed = 0;
let totalSuccessful = 0;
let totalFailed = 0;
let totalSkipped = 0;
let offset = START_OFFSET;

async function runBatch(batchSize, currentOffset) {
  const url = `${BASE_URL}/api/migrations/sync-clerk-to-audienceful?limit=${batchSize}&offset=${currentOffset}`;
  
  console.log(`\n🔄 Processing batch: offset=${currentOffset}, limit=${batchSize}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIGRATION_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Batch failed:`, data);
      return { success: false, hasMore: false, error: data };
    }

    const results = data.results || data;
    
    totalProcessed += results.totalUsers || 0;
    totalSuccessful += results.successful || 0;
    totalFailed += results.failed || 0;
    totalSkipped += results.skipped || 0;

    console.log(`✅ Batch complete: ${results.successful || 0} successful, ${results.failed || 0} failed, ${results.skipped || 0} skipped`);
    
    if (results.errors && results.errors.length > 0) {
      console.log(`⚠️  Errors in this batch:`);
      results.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error.email}: ${error.error}`);
      });
    }

    // Check if there are more users to process
    const hasMore = (results.totalUsers || 0) === batchSize;
    
    return { success: true, hasMore, results };
  } catch (error) {
    console.error(`❌ Error processing batch:`, error.message);
    return { success: false, hasMore: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting batch sync of Clerk users to Audienceful');
  console.log(`📊 Batch size: ${BATCH_SIZE} users`);
  console.log(`📍 Starting offset: ${START_OFFSET}`);
  console.log(`🔗 Target: ${BASE_URL}\n`);

  let hasMore = true;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  while (hasMore) {
    const result = await runBatch(BATCH_SIZE, offset);

    if (!result.success) {
      consecutiveErrors++;
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error(`\n❌ Too many consecutive errors (${consecutiveErrors}). Stopping.`);
        break;
      }
      console.log(`⚠️  Retrying after error...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      continue;
    }

    consecutiveErrors = 0; // Reset error counter on success
    
    if (result.hasMore) {
      offset += BATCH_SIZE;
      // Small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      hasMore = false;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total users processed: ${totalProcessed}`);
  console.log(`✅ Successful: ${totalSuccessful}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`⏭️  Skipped: ${totalSkipped}`);
  console.log('='.repeat(50));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
