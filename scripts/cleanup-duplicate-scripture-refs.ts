/**
 * Cleanup script to remove duplicate entries from NoteScriptureReferences table
 * This must be run before adding the unique constraint to the table
 */

import { db, NoteScriptureReferences, sql } from 'astro:db';

async function cleanupDuplicates() {
  console.log('Starting cleanup of duplicate scripture reference entries...');

  // Find all duplicate entries (grouped by noteId and scriptureNoteId)
  const duplicates = await db.execute(sql`
    SELECT noteId, scriptureNoteId, COUNT(*) as count
    FROM NoteScriptureReferences
    GROUP BY noteId, scriptureNoteId
    HAVING count > 1
  `);

  console.log(`Found ${duplicates.rows.length} sets of duplicates`);

  if (duplicates.rows.length === 0) {
    console.log('No duplicates found. Database is clean!');
    return;
  }

  let totalDeleted = 0;

  // For each set of duplicates, keep the oldest entry and delete the rest
  for (const dup of duplicates.rows) {
    const noteId = dup.noteId as string;
    const scriptureNoteId = dup.scriptureNoteId as string;
    const count = dup.count as number;

    console.log(`Processing duplicates for note ${noteId} -> scripture ${scriptureNoteId} (${count} entries)`);

    // Get all entries for this combination, ordered by createdAt (oldest first)
    const entries = await db.execute(sql`
      SELECT id, createdAt
      FROM NoteScriptureReferences
      WHERE noteId = ${noteId} AND scriptureNoteId = ${scriptureNoteId}
      ORDER BY createdAt ASC
    `);

    // Keep the first one (oldest), delete the rest
    const entriesToDelete = entries.rows.slice(1);

    for (const entry of entriesToDelete) {
      await db.execute(sql`
        DELETE FROM NoteScriptureReferences
        WHERE id = ${entry.id as string}
      `);
      totalDeleted++;
      console.log(`  Deleted duplicate entry ${entry.id}`);
    }
  }

  console.log(`\nCleanup complete! Deleted ${totalDeleted} duplicate entries.`);
  console.log('You can now run "npm run db:push" to add the unique constraint.');
}

cleanupDuplicates()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during cleanup:', error);
    process.exit(1);
  });
