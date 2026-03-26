/**
 * Migration script to add data-scripture-translation="NET" to existing scripture pills
 * that don't have a translation attribute.
 *
 * Usage:
 *   npx tsx server/scripts/migrate-scripture-translations.ts [--dry-run]
 */

import 'dotenv/config';
import { db } from '../db/client';
import { Notes } from '../db/schema';
import { like } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');

// Match scripture pill spans that have data-scripture-reference but NO data-scripture-translation
const PILL_WITHOUT_TRANSLATION = /(<span[^>]*data-scripture-reference="[^"]*")(?![^>]*data-scripture-translation)/g;

async function migrate() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Migrating scripture pills to include translation attribute...`);

  // Find all notes that contain scripture pills
  const notes = await db
    .select({ id: Notes.id, content: Notes.content })
    .from(Notes)
    .where(like(Notes.content, '%data-scripture-reference%'));

  console.log(`Found ${notes.length} notes with scripture references.`);

  let updatedCount = 0;

  for (const note of notes) {
    const original = note.content;

    // Add data-scripture-translation="NET" to pills that don't have it
    const updated = original.replace(
      PILL_WITHOUT_TRANSLATION,
      '$1 data-scripture-translation="NET"'
    );

    if (updated !== original) {
      updatedCount++;
      if (DRY_RUN) {
        console.log(`  Would update note ${note.id}`);
      } else {
        await db
          .update(Notes)
          .set({ content: updated })
          .where(like(Notes.id, note.id));
        console.log(`  Updated note ${note.id}`);
      }
    }
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] Would update' : 'Updated'} ${updatedCount} of ${notes.length} notes.`);
  console.log('Done.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
