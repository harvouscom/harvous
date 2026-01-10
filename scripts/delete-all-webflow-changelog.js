#!/usr/bin/env node

/**
 * Delete all items from Webflow Changelog Collection
 * 
 * This script deletes all items from the Webflow changelog collection.
 * Use with caution!
 */

const WEBFLOW_COLLECTION_ID = '6914bfd8c7facb8fa00eaad3';
const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

async function deleteAllItems() {
  const webflowToken = process.env.WEBFLOW_API_TOKEN;
  
  if (!webflowToken) {
    console.error('❌ WEBFLOW_API_TOKEN not set.');
    process.exit(1);
  }
  
  try {
    console.log('🔍 Fetching all items from collection...\n');
    
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
    
    console.log(`📋 Found ${items.length} item(s) to delete\n`);
    
    if (items.length === 0) {
      console.log('✅ No items to delete.');
      return;
    }
    
    // Delete each item
    let deletedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemName = item.fieldData?.name || item.id;
      
      console.log(`[${i + 1}/${items.length}] Deleting: ${itemName}...`);
      
      try {
        const deleteResponse = await fetch(
          `${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items/${item.id}`,
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
          console.error(`   ❌ Failed: ${errorText}`);
          errorCount++;
        } else {
          console.log(`   ✅ Deleted`);
          deletedCount++;
        }
        
        // Small delay to avoid rate limiting
        if (i < items.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Deletion complete!`);
    console.log(`   Deleted: ${deletedCount}`);
    console.log(`   Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

deleteAllItems();
