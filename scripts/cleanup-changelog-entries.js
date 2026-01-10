#!/usr/bin/env node

/**
 * Cleanup Changelog Entries
 * 
 * This script deletes specified entries from the Webflow changelog collection.
 * 
 * Usage:
 *   node scripts/cleanup-changelog-entries.js [entry-id-1] [entry-id-2] ...
 * 
 * Or with JSON array:
 *   node scripts/cleanup-changelog-entries.js --ids '["id1", "id2", ...]'
 */

const WEBFLOW_COLLECTION_ID = '6914bfd8c7facb8fa00eaad3';
const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

async function deleteEntries(entryIds) {
  // Use changelog-specific token if available, fallback to inbox token for backward compatibility
  const webflowToken = process.env.WEBFLOW_CHANGELOG_API_TOKEN || process.env.WEBFLOW_INBOX_API_TOKEN;
  
  if (!webflowToken) {
    console.error('❌ WEBFLOW_CHANGELOG_API_TOKEN (or WEBFLOW_INBOX_API_TOKEN) not set.');
    process.exit(1);
  }
  
  if (!entryIds || entryIds.length === 0) {
    console.error('❌ No entry IDs provided.');
    console.error('Usage: node scripts/cleanup-changelog-entries.js [id1] [id2] ...');
    console.error('   Or: node scripts/cleanup-changelog-entries.js --ids \'["id1", "id2"]\'');
    process.exit(1);
  }
  
  console.log(`🗑️  Deleting ${entryIds.length} entry/entries...\n`);
  
  let deletedCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < entryIds.length; i++) {
    const entryId = entryIds[i];
    
    try {
      const deleteResponse = await fetch(
        `${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items/${entryId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${webflowToken}`,
            'Accept-Version': '1.0.0'
          }
        }
      );
      
      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        console.error(`[${i + 1}/${entryIds.length}] ❌ Failed to delete ${entryId}: ${errorText}`);
        errorCount++;
      } else {
        console.log(`[${i + 1}/${entryIds.length}] ✅ Deleted ${entryId}`);
        deletedCount++;
      }
      
      // Small delay to avoid rate limiting
      if (i < entryIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error(`[${i + 1}/${entryIds.length}] ❌ Error deleting ${entryId}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n✅ Cleanup complete!`);
  console.log(`   Deleted: ${deletedCount}`);
  console.log(`   Errors: ${errorCount}`);
}

// Parse command line arguments
const args = process.argv.slice(2);

let entryIds = [];

if (args.length > 0 && args[0] === '--ids') {
  // Parse JSON array
  try {
    const jsonString = args[1] || args.slice(1).join(' ');
    entryIds = JSON.parse(jsonString);
  } catch (error) {
    console.error('❌ Invalid JSON format for --ids');
    process.exit(1);
  }
} else {
  // Parse individual IDs
  entryIds = args.filter(arg => arg && !arg.startsWith('--'));
}

deleteEntries(entryIds);
