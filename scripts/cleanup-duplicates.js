/**
 * Simple cleanup script to remove duplicate scripture reference entries
 * This connects directly to the local Astro DB and removes duplicates
 */

import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Read the Astro DB URL from .astro directory
  const astroDir = path.join(__dirname, '..', '.astro');
  const dbPath = path.join(astroDir, 'content.db');

  if (!fs.existsSync(dbPath)) {
    console.error('❌ Local database not found. Please run "npm run dev" first to create it.');
    process.exit(1);
  }

  console.log(`📂 Using database: ${dbPath}`);

  const client = createClient({
    url: `file:${dbPath}`
  });

  try {
    console.log('\n🔍 Finding duplicate entries...');

    // Get all entries
    const result = await client.execute('SELECT * FROM NoteScriptureReferences ORDER BY createdAt ASC');
    const allEntries = result.rows;

    console.log(`   Found ${allEntries.length} total entries`);

    // Group by noteId and scriptureNoteId
    const groups = new Map();
    for (const entry of allEntries) {
      const key = `${entry.noteId}::${entry.scriptureNoteId}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(entry);
    }

    // Find duplicates
    const duplicates = Array.from(groups.entries()).filter(([_, entries]) => entries.length > 1);

    if (duplicates.length === 0) {
      console.log('\n✅ No duplicates found! Database is clean.');
      client.close();
      return;
    }

    console.log(`\n⚠️  Found ${duplicates.length} groups with duplicates:\n`);

    let totalDeleted = 0;

    // For each duplicate group, keep the oldest and delete the rest
    for (const [key, entries] of duplicates) {
      const [noteId, scriptureNoteId] = key.split('::');
      console.log(`   ${key}:`);
      console.log(`     - Has ${entries.length} duplicate entries`);

      // Keep the first one (oldest), delete the rest
      const [kept, ...toDelete] = entries;

      console.log(`     - Keeping: ${kept.id} (${new Date(kept.createdAt).toISOString()})`);

      for (const entry of toDelete) {
        await client.execute({
          sql: 'DELETE FROM NoteScriptureReferences WHERE id = ?',
          args: [entry.id]
        });
        totalDeleted++;
        console.log(`     - Deleted: ${entry.id} (${new Date(entry.createdAt).toISOString()})`);
      }
    }

    console.log(`\n✅ Cleanup complete! Deleted ${totalDeleted} duplicate entries.`);
    console.log('\n   Next step: Run "npm run db:push" to add the unique constraint.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
