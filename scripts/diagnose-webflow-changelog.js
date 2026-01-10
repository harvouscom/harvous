#!/usr/bin/env node

/**
 * Diagnostic script to fetch Webflow Changelog Collection schema
 * 
 * This script fetches the collection schema to verify field slugs
 * and get current category option IDs.
 * 
 * Usage:
 *   node scripts/diagnose-webflow-changelog.js
 * 
 * Make sure WEBFLOW_CHANGELOG_API_TOKEN (or WEBFLOW_INBOX_API_TOKEN) is set in your environment.
 */

const WEBFLOW_COLLECTION_ID = '6914bfd8c7facb8fa00eaad3';
const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

async function diagnoseCollection() {
  // Use changelog-specific token if available, fallback to inbox token for backward compatibility
  const webflowToken = process.env.WEBFLOW_CHANGELOG_API_TOKEN || process.env.WEBFLOW_INBOX_API_TOKEN;
  
  if (!webflowToken) {
    console.error('❌ WEBFLOW_CHANGELOG_API_TOKEN (or WEBFLOW_INBOX_API_TOKEN) not set. Please set it in your environment.');
    console.error('   You can export it: export WEBFLOW_CHANGELOG_API_TOKEN="your-token-here"');
    console.error('   Or run: WEBFLOW_CHANGELOG_API_TOKEN="your-token-here" node scripts/diagnose-webflow-changelog.js');
    process.exit(1);
  }
  
  try {
    console.log('🔍 Fetching collection schema from Webflow...\n');
    
    // Fetch collection schema
    const response = await fetch(
      `${WEBFLOW_API_BASE}/collections/${WEBFLOW_COLLECTION_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${webflowToken}`,
          'Accept-Version': '1.0.0'
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error fetching collection:', errorText);
      process.exit(1);
    }
    
    const collection = await response.json();
    
    console.log('📋 Collection Schema:');
    console.log('====================\n');
    console.log(`Collection Name: ${collection.displayName || collection.name || 'N/A'}`);
    console.log(`Collection ID: ${collection.id}\n`);
    
    console.log('Fields:');
    console.log('-------');
    
    if (collection.fields && Array.isArray(collection.fields)) {
      collection.fields.forEach((field, index) => {
        console.log(`\n${index + 1}. ${field.displayName || field.name || 'Unnamed'}`);
        console.log(`   Slug: ${field.slug || field.id || 'N/A'}`);
        console.log(`   Type: ${field.type || 'N/A'}`);
        console.log(`   Required: ${field.isRequired ? 'Yes' : 'No'}`);
        
        // If it's an Option field, show the options
        if (field.type === 'Option') {
          if (field.validations && field.validations.options) {
            console.log(`   Options:`);
            field.validations.options.forEach((option, optIndex) => {
              const optionName = option.displayName || option.name || 'Unnamed';
              console.log(`     ${optIndex + 1}. "${optionName}" (ID: ${option.id})`);
            });
          } else if (field.validations && Array.isArray(field.validations)) {
            // Sometimes options are in a different structure
            field.validations.forEach((validation, optIndex) => {
              if (validation.options) {
                console.log(`   Options:`);
                validation.options.forEach((option, optIdx) => {
                  const optionName = option.displayName || option.name || 'Unnamed';
                  console.log(`     ${optIdx + 1}. "${optionName}" (ID: ${option.id})`);
                });
              }
            });
          } else {
            console.log(`   Options: (structure unknown - check raw data below)`);
          }
        }
      });
    } else {
      console.log('⚠️  No fields found or fields structure is different.');
      console.log('\nFull collection data:');
      console.log(JSON.stringify(collection, null, 2));
    }
    
    // Generate updated CATEGORY_MAP if category field found
    const categoryField = collection.fields?.find(f => 
      f.slug === 'category' || 
      f.name === 'Category' || 
      f.displayName === 'Category' ||
      (f.slug && f.slug.toLowerCase().includes('category'))
    );
    
    if (categoryField && categoryField.type === 'Option') {
      console.log('\n\n📝 Suggested CATEGORY_MAP:');
      console.log('========================\n');
      console.log('const CATEGORY_MAP = {');
      
      let options = [];
      if (categoryField.validations && categoryField.validations.options) {
        options = categoryField.validations.options;
      } else if (categoryField.validations && Array.isArray(categoryField.validations)) {
        // Try to find options in validations array
        for (const validation of categoryField.validations) {
          if (validation.options && Array.isArray(validation.options)) {
            options = validation.options;
            break;
          }
        }
      }
      
      if (options.length > 0) {
        options.forEach((option) => {
          const optionName = (option.displayName || option.name || '').toLowerCase();
          // Map common commit types - try to match based on name
          let commitType = 'chore'; // default
          
          if (optionName.includes('feat') || optionName.includes('feature')) {
            commitType = 'feat';
          } else if (optionName.includes('fix') || optionName.includes('bug')) {
            commitType = 'fix';
          } else if (optionName.includes('refactor')) {
            commitType = 'refactor';
          } else if (optionName.includes('style')) {
            commitType = 'style';
          } else if (optionName.includes('doc')) {
            commitType = 'docs';
          } else if (optionName.includes('test')) {
            commitType = 'test';
          } else if (optionName.includes('chore')) {
            commitType = 'chore';
          } else if (optionName.includes('perf') || optionName.includes('performance')) {
            commitType = 'perf';
          } else if (optionName.includes('build')) {
            commitType = 'build';
          } else if (optionName.includes('ci')) {
            commitType = 'ci';
          }
          
          console.log(`  '${commitType}': '${option.id}', // ${option.displayName || option.name}`);
        });
      } else {
        console.log('  // Could not extract options automatically');
        console.log('  // Please check the field data above and map manually');
      }
      
      console.log('};');
    } else {
      console.log('\n⚠️  Category field not found or is not an Option field.');
      console.log('   Please check the fields above to find the category field.');
    }
    
    console.log('\n\n✅ Diagnostic complete!');
    console.log('   Use the field slugs and category option IDs above to update the sync script.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

diagnoseCollection();
