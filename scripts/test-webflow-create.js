#!/usr/bin/env node

/**
 * Test creating a single Webflow item to see the actual API response
 */

const WEBFLOW_COLLECTION_ID = '6914bfd8c7facb8fa00eaad3';
const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

const CATEGORY_MAP = {
  'Feature': 'fc75e0b94768195db5ecd06607d3a596',
  'Fix': '6b12417229c034f993616ccdcb8d3ca6',
  'Improvement': '938b0ef47d5f79e79b2c6e0acb639ede'
};

async function testCreate() {
  // Use changelog-specific token if available, fallback to inbox token for backward compatibility
  const webflowToken = process.env.WEBFLOW_CHANGELOG_API_TOKEN || process.env.WEBFLOW_INBOX_API_TOKEN;
  
  if (!webflowToken) {
    console.error('❌ WEBFLOW_CHANGELOG_API_TOKEN (or WEBFLOW_INBOX_API_TOKEN) not set.');
    process.exit(1);
  }
  
  const itemData = {
    isDraft: false,
    isArchived: false,
    fieldData: {
      name: 'Test Changelog Entry',
      slug: 'test-changelog-entry-' + Date.now(),
      'version-number': '1.0.0',
      'date': new Date().toISOString(),
      'commit-message': '<p>This is a test entry</p>',
      'category': CATEGORY_MAP['Feature']
    }
  };
  
  console.log('📤 Sending request to Webflow API...\n');
  console.log('Request body:', JSON.stringify(itemData, null, 2));
  console.log('\n');
  
  try {
    const createResponse = await fetch(
      `${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}/items`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${webflowToken}`,
          'Accept-Version': '1.0.0',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemData)
      }
    );
    
    console.log(`Response status: ${createResponse.status} ${createResponse.statusText}\n`);
    
    const responseText = await createResponse.text();
    console.log('Response body:', responseText);
    console.log('\n');
    
    if (!createResponse.ok) {
      console.error('❌ Request failed');
      process.exit(1);
    }
    
    try {
      const createResult = JSON.parse(responseText);
      console.log('Parsed response:', JSON.stringify(createResult, null, 2));
      
      const itemId = createResult.id || createResult.items?.[0]?.id;
      console.log(`\n✅ Item ID: ${itemId || 'NOT FOUND'}`);
    } catch (parseError) {
      console.error('❌ Could not parse response as JSON');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

testCreate();
