/**
 * Database cleanup script to remove duplicate scripture reference entries
 * Run with: npm run db:execute cleanup-duplicates.mts
 */

import { db, NoteScriptureReferences, eq } from 'astro:db';

async function cleanupDuplicates() {
  console.log('Starting cleanup of duplicate scripture reference entries...');

  // Find all entries grouped by noteId and scriptureNoteId
  const allEntries = await db.select()
    .from(NoteScriptureReferences)
    .all();

  console.log(`Total entries found: ${allEntries.length}`);

  // Group entries by (noteId, scriptureNoteId) combination
  const groupedEntries = new Map<string, typeof allEntries>();

  for (const entry of allEntries) {
    const key = `${entry.noteId}::${entry.scriptureNoteId}`;
    if (!groupedEntries.has(key)) {
      groupedEntries.set(key, []);
    }
    groupedEntries.get(key)!.push(entry);
  }

  // Find groups with duplicates
  const duplicateGroups = Array.from(groupedEntries.entries())
    .filter(([_, entries]) => entries.length > 1);

  console.log(`Found ${duplicateGroups.length} groups with duplicates`);

  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicates found. Database is clean!');
    return;
  }

  let totalDeleted = 0;

  // For each duplicate group, keep the oldest entry and delete the rest
  for (const [key, entries] of duplicateGroups) {
    // Sort by createdAt (oldest first)
    const sorted = entries.sort((a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime()
    );

    const [kept, ...toDelete] = sorted;

    console.log(`\n${key}:`);
    console.log(`  ✓ Keeping: ${kept.id} (created ${kept.createdAt.toISOString()})`);

    // Delete all but the first (oldest) entry
    for (const entry of toDelete) {
      await db.delete(NoteScriptureReferences)
        .where(eq(NoteScriptureReferences.id, entry.id));
      totalDeleted++;
      console.log(`  ✗ Deleted: ${entry.id} (created ${entry.createdAt.toISOString()})`);
    }
  }

  console.log(`\n✅ Cleanup complete! Deleted ${totalDeleted} duplicate entries.`);
  console.log('You can now run "npm run db:push" to add the unique constraint.');
}

cleanupDuplicates().catch((error) => {
  console.error('❌ Error during cleanup:', error);
  process.exit(1);
});
