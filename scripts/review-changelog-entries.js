#!/usr/bin/env node

/**
 * Review Changelog Entries
 * 
 * This script lists all Webflow changelog entries and identifies
 * likely internal/technical entries that may not be user-relevant.
 * 
 * Usage:
 *   node scripts/review-changelog-entries.js
 */

const WEBFLOW_COLLECTION_ID = '6914bfd8c7facb8fa00eaad3';
const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

// Keywords that indicate internal/technical changes
const INTERNAL_KEYWORDS = [
  'error handling',
  'migration',
  'api',
  'endpoint',
  'function',
  'method',
  'format',
  'logging',
  'parsing',
  'subscriber',
  'webhook',
  'changelog',
  'refactor',
  'internal',
  'backend',
  'updateSubscriber',
  'retry-failed',
  'audienceful',
  'clerk',
  'webhook integration'
];

// Check if an entry is likely internal/technical
function isLikelyInternal(name, content) {
  const text = `${name} ${content}`.toLowerCase();
  return INTERNAL_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()));
}

async function reviewEntries() {
  const webflowToken = process.env.WEBFLOW_API_TOKEN;
  
  if (!webflowToken) {
    console.error('❌ WEBFLOW_API_TOKEN not set.');
    process.exit(1);
  }
  
  try {
    console.log('🔍 Fetching changelog entries from Webflow...\n');
    
    // Fetch all items
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
    
    console.log(`📋 Found ${items.length} entry/entries\n`);
    console.log('='.repeat(80));
    console.log('ENTRY REVIEW');
    console.log('='.repeat(80));
    console.log('');
    
    const internalEntries = [];
    const userRelevantEntries = [];
    
    items.forEach((item, index) => {
      const name = item.fieldData?.name || 'Untitled';
      const content = item.fieldData?.['commit-message'] || '';
      const version = item.fieldData?.['version-number'] || 'N/A';
      const category = item.fieldData?.category || 'N/A';
      const isInternal = isLikelyInternal(name, content);
      
      console.log(`${index + 1}. ${name}`);
      console.log(`   Version: ${version}`);
      console.log(`   Category: ${category}`);
      console.log(`   Content: ${content.replace(/<[^>]*>/g, '').substring(0, 100)}...`);
      console.log(`   Status: ${isInternal ? '⚠️  LIKELY INTERNAL' : '✅ USER-RELEVANT'}`);
      console.log(`   ID: ${item.id}`);
      console.log('');
      
      if (isInternal) {
        internalEntries.push({
          id: item.id,
          name,
          version,
          category,
          content
        });
      } else {
        userRelevantEntries.push({
          id: item.id,
          name,
          version,
          category,
          content
        });
      }
    });
    
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total entries: ${items.length}`);
    console.log(`⚠️  Likely internal/technical: ${internalEntries.length}`);
    console.log(`✅ User-relevant: ${userRelevantEntries.length}`);
    console.log('');
    
    if (internalEntries.length > 0) {
      console.log('ENTRIES TO CONSIDER DELETING:');
      console.log('-'.repeat(80));
      internalEntries.forEach((entry, index) => {
        console.log(`${index + 1}. [${entry.version}] ${entry.name}`);
        console.log(`   ID: ${entry.id}`);
      });
      console.log('');
      
      // Export IDs for cleanup script
      const idsToDelete = internalEntries.map(e => e.id);
      console.log('IDs to delete (copy for cleanup script):');
      console.log(JSON.stringify(idsToDelete, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

reviewEntries();
