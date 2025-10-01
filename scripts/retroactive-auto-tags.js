#!/usr/bin/env node

/**
 * Retroactive Auto-Tags Script
 * 
 * This script processes all existing notes that don't have tags yet
 * and applies auto-generated tags based on their content.
 * 
 * Usage: node scripts/retroactive-auto-tags.js [USER_ID] [--dry-run]
 */

import { runRetroactiveAutoTags } from '../src/utils/retroactive-auto-tag-processor.js';
import { getProcessingStats } from '../src/utils/retroactive-utils.js';

async function processRetroactiveAutoTags() {
  try {
    console.log('🚀 Starting retroactive auto-tag process...');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const userId = args.find(arg => !arg.startsWith('--'));
    const isDryRun = args.includes('--dry-run');
    
    if (!userId) {
      console.error('❌ Please provide a userId as an argument:');
      console.error('   node scripts/retroactive-auto-tags.js YOUR_USER_ID');
      console.error('   node scripts/retroactive-auto-tags.js YOUR_USER_ID --dry-run');
      process.exit(1);
    }
    
    console.log(`📝 Processing notes for user: ${userId}`);
    if (isDryRun) {
      console.log('🔍 Running in DRY RUN mode - no changes will be made');
    }
    
    // Show current stats
    const stats = await getProcessingStats(userId);
    console.log(`📊 Current stats:`, {
      totalNotes: stats.totalNotes,
      notesWithTags: stats.notesWithTags,
      notesWithoutTags: stats.notesWithoutTags,
      tagCoverage: `${stats.tagCoverage}%`
    });

    if (stats.notesWithoutTags === 0) {
      console.log('✅ All notes already have tags!');
      return;
    }

    // Run the retroactive auto-tag process
    const result = await runRetroactiveAutoTags(userId, {
      confidenceThreshold: 0.8,
      dryRun: isDryRun,
      onProgress: (current, total, item) => {
        console.log(`\n📄 Processing ${current}/${total}: ${item.id}`);
        console.log(`   Title: ${item.title?.substring(0, 50) || 'Untitled'}...`);
      }
    });

    // Show results
    console.log(`\n🎉 Retroactive auto-tag process completed!`);
    console.log(`   📊 Total: ${result.total}`);
    console.log(`   ✅ Successful: ${result.successful}`);
    console.log(`   ❌ Errors: ${result.errors}`);
    console.log(`   📝 Processed: ${result.processed}`);

    // Show some example results
    if (result.results.length > 0) {
      console.log(`\n📋 Sample results:`);
      result.results.slice(0, 5).forEach((item, index) => {
        if (item.success && item.details?.tags) {
          console.log(`   ${index + 1}. ${item.id}: ${item.details.tags.join(', ')}`);
        }
      });
    }

  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Run the script
processRetroactiveAutoTags();
