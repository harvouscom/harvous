#!/usr/bin/env node

/**
 * Reprocess Scripture Verses Script
 * 
 * Finds scripture notes that were created without verse content (due to API failures)
 * and reprocesses them to fetch the actual verse text from Bible.org API.
 * 
 * This script addresses the issue where scripture notes were created with just the
 * reference text instead of actual verse content due to timeout failures on mobile
 * networks (fixed in scripture_fetch_mobile_fix).
 * 
 * Usage: npx tsx scripts/fixes/reprocess-scripture-verses.ts [USER_ID] [--dry-run]
 */

import { db, Notes, ScriptureMetadata, eq, and } from 'astro:db';
import { fetchWithTimeout } from '../../src/utils/fetch-helpers.js';

interface ReprocessResult {
  noteId: string;
  reference: string;
  success: boolean;
  error?: string;
  verseText?: string;
}

async function reprocessScriptureVerses(userId: string, dryRun: boolean = false): Promise<ReprocessResult[]> {
  console.log(`🔍 Finding scripture notes for user: ${userId}`);
  
  // Find all scripture notes for this user
  const scriptureNotes = await db.select({
    noteId: Notes.id,
    content: Notes.content,
    title: Notes.title,
  })
    .from(Notes)
    .where(and(
      eq(Notes.noteType, 'scripture'),
      eq(Notes.userId, userId)
    ))
    .all();

  console.log(`📚 Found ${scriptureNotes.length} scripture notes`);

  const results: ReprocessResult[] = [];

  for (const note of scriptureNotes) {
    // Get ScriptureMetadata for this note
    const metadata = await db.select()
      .from(ScriptureMetadata)
      .where(eq(ScriptureMetadata.noteId, note.noteId))
      .get();

    if (!metadata) {
      console.log(`⚠️  Note ${note.noteId} has no ScriptureMetadata - skipping`);
      results.push({
        noteId: note.noteId,
        reference: note.title || 'Unknown',
        success: false,
        error: 'No ScriptureMetadata found'
      });
      continue;
    }

    const reference = metadata.reference;
    const originalText = metadata.originalText || '';

    // Check if originalText is empty or just equals the reference (not actual verse content)
    // Verse content should have HTML tags like <sup> or be longer than just the reference
    const needsReprocessing = 
      !originalText || 
      originalText.trim() === '' ||
      originalText.trim() === reference ||
      originalText.trim() === reference.charAt(0).toUpperCase() + reference.slice(1) ||
      (!originalText.includes('<sup>') && originalText.length < reference.length + 20); // Rough heuristic

    if (!needsReprocessing) {
      console.log(`✅ Note ${note.noteId} (${reference}) already has verse content - skipping`);
      continue;
    }

    console.log(`\n🔄 Reprocessing ${reference} (note: ${note.noteId})`);

    if (dryRun) {
      console.log(`   [DRY RUN] Would fetch verse for: ${reference}`);
      results.push({
        noteId: note.noteId,
        reference,
        success: true,
        verseText: '[DRY RUN]'
      });
      continue;
    }

    try {
      // Fetch verse text from Bible.org API
      const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
      const verseResponse = await fetchWithTimeout(apiUrl, {
        timeout: 10000, // 10 seconds for initial attempt
        retries: 2, // 2 retries
        retryTimeout: 5000, // 5 seconds for retries
      });

      if (!verseResponse.ok) {
        throw new Error(`Bible.org API returned error: ${verseResponse.status} ${verseResponse.statusText}`);
      }

      const verses = await verseResponse.json();
      
      if (!Array.isArray(verses) || verses.length === 0) {
        throw new Error('No verses returned from API');
      }

      // Format verse text with superscript verse numbers (same format as process-scripture-references.ts)
      const verseText = verses.map((v: any) => `<sup>${v.verse}</sup>${v.text}`).join(' ');
      const capitalizedContent = verseText.charAt(0).toUpperCase() + verseText.slice(1);

      // Update Note.content
      await db.update(Notes)
        .set({ 
          content: capitalizedContent,
          updatedAt: new Date()
        })
        .where(eq(Notes.id, note.noteId));

      // Update ScriptureMetadata.originalText
      await db.update(ScriptureMetadata)
        .set({ 
          originalText: capitalizedContent
        })
        .where(eq(ScriptureMetadata.noteId, note.noteId));

      console.log(`   ✅ Successfully updated with verse content (${verseText.length} chars)`);
      
      results.push({
        noteId: note.noteId,
        reference,
        success: true,
        verseText: capitalizedContent.substring(0, 100) + '...' // Preview
      });

    } catch (error: any) {
      console.error(`   ❌ Error fetching verse for ${reference}:`, error.message || error);
      results.push({
        noteId: note.noteId,
        reference,
        success: false,
        error: error.message || 'Unknown error'
      });
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

async function main() {
  try {
    console.log('🚀 Starting scripture verse reprocessing...');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const userId = args.find(arg => !arg.startsWith('--'));
    const isDryRun = args.includes('--dry-run');
    
    if (!userId) {
      console.error('❌ Please provide a userId as an argument:');
      console.error('   npx tsx scripts/fixes/reprocess-scripture-verses.ts YOUR_USER_ID');
      console.error('   npx tsx scripts/fixes/reprocess-scripture-verses.ts YOUR_USER_ID --dry-run');
      process.exit(1);
    }
    
    console.log(`📝 Processing scripture notes for user: ${userId}`);
    if (isDryRun) {
      console.log('🔍 Running in DRY RUN mode - no changes will be made');
    }
    
    const results = await reprocessScriptureVerses(userId, isDryRun);

    // Show summary
    console.log(`\n🎉 Reprocessing completed!`);
    console.log(`   📊 Total processed: ${results.length}`);
    console.log(`   ✅ Successful: ${results.filter(r => r.success).length}`);
    console.log(`   ❌ Errors: ${results.filter(r => !r.success).length}`);

    // Show failed ones
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      console.log(`\n❌ Failed references:`);
      failed.forEach(r => {
        console.log(`   - ${r.reference}: ${r.error}`);
      });
    }

    // Show some successful ones
    const successful = results.filter(r => r.success);
    if (successful.length > 0) {
      console.log(`\n✅ Successfully reprocessed:`);
      successful.slice(0, 5).forEach(r => {
        console.log(`   - ${r.reference}`);
      });
      if (successful.length > 5) {
        console.log(`   ... and ${successful.length - 5} more`);
      }
    }

  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Run the script
main();

