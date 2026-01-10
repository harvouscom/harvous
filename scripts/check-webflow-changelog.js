#!/usr/bin/env node

/**
 * Check Webflow Changelog Collection Items
 * 
 * This script lists all items in the Webflow changelog collection
 * to verify what's actually in there.
 */

const WEBFLOW_COLLECTION_ID = '6914bfd8c7facb8fa00eaad3';
const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

async function checkCollection() {
  // Use changelog-specific token if available, fallback to inbox token for backward compatibility
  const webflowToken = process.env.WEBFLOW_CHANGELOG_API_TOKEN || process.env.WEBFLOW_INBOX_API_TOKEN;
  
  if (!webflowToken) {
    console.error('❌ WEBFLOW_CHANGELOG_API_TOKEN (or WEBFLOW_INBOX_API_TOKEN) not set.');
    process.exit(1);
  }
  
  try {
    console.log('🔍 Fetching items from Webflow collection...\n');
    
    // Fetch items from the collection
    const response = await fetch(
      `${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items`,
      {
        headers: {
          'Authorization': `Bearer ${webflowToken}`,
          'Accept-Version': '1.0.0'
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error fetching items:', errorText);
      process.exit(1);
    }
    
    const data = await response.json();
    const items = data.items || [];
    
    console.log(`📋 Found ${items.length} item(s) in collection:\n`);
    
    if (items.length === 0) {
      console.log('⚠️  No items found. The backfill may not have created any items.');
      console.log('   Check the backfill script output for errors.');
    } else {
      items.forEach((item, index) => {
        console.log(`${index + 1}. ${item.fieldData?.name || 'Untitled'}`);
        console.log(`   Version: ${item.fieldData?.['version-number'] || 'N/A'}`);
        console.log(`   Category: ${item.fieldData?.category || 'N/A'}`);
        console.log(`   Date: ${item.fieldData?.date || 'N/A'}`);
        const isDraft = item.isDraft || false;
        const isPublished = item.lastPublished !== null && item.lastPublished !== undefined;
        console.log(`   Draft: ${isDraft ? 'Yes' : 'No'}`);
        console.log(`   Published: ${isPublished ? 'Yes' : 'No'}`);
        console.log(`   ID: ${item.id}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

checkCollection();
