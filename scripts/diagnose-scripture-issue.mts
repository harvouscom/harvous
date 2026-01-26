/**
 * Diagnostic script to understand scripture pill and count issues
 * Run with: node --loader ts-node/esm scripts/diagnose-scripture-issue.mts <noteId>
 */

import { db, Notes, NoteScriptureReferences, ScriptureMetadata } from 'astro:db';
import { eq } from 'astro:db';

const noteId = process.argv[2];

if (!noteId) {
  console.error('Usage: node --loader ts-node/esm scripts/diagnose-scripture-issue.mts <noteId>');
  process.exit(1);
}

async function diagnose() {
  console.log(`\n🔍 Diagnosing scripture issue for note: ${noteId}\n`);

  // Get the note
  const note = await db.select().from(Notes).where(eq(Notes.id, noteId)).get();

  if (!note) {
    console.error('❌ Note not found');
    process.exit(1);
  }

  console.log(`📝 Note: ${note.title || '(untitled)'}`);
  console.log(`   Type: ${note.noteType || 'default'}`);
  console.log(`   Content length: ${note.content?.length || 0} chars\n`);

  // Extract scripture pills from content
  const pillPattern = /<span[^>]*class="scripture-reference-link"[^>]*data-scripture-reference="([^"]*)"[^>]*data-note-id="([^"]*)"[^>]*>/gi;
  const pills: Array<{ reference: string; noteId: string }> = [];

  let match;
  while ((match = pillPattern.exec(note.content || '')) !== null) {
    pills.push({
      reference: match[1],
      noteId: match[2]
    });
  }

  console.log(`💊 Scripture Pills Found in Content: ${pills.length}`);
  pills.forEach((pill, i) => {
    console.log(`   ${i + 1}. ${pill.reference} (noteId: ${pill.noteId})`);
  });
  console.log();

  // Get junction entries
  const junctionEntries = await db.select()
    .from(NoteScriptureReferences)
    .where(eq(NoteScriptureReferences.noteId, noteId))
    .all();

  console.log(`🔗 Junction Entries in Database: ${junctionEntries.length}`);

  for (const entry of junctionEntries) {
    // Get scripture metadata
    const metadata = await db.select()
      .from(ScriptureMetadata)
      .where(eq(ScriptureMetadata.noteId, entry.scriptureNoteId))
      .get();

    console.log(`   - ${metadata?.reference || 'Unknown'} (scriptureNoteId: ${entry.scriptureNoteId})`);
  }
  console.log();

  // Check for discrepancies
  const pillNoteIds = new Set(pills.filter(p => p.noteId !== 'pending').map(p => p.noteId));
  const junctionNoteIds = new Set(junctionEntries.map(e => e.scriptureNoteId));

  console.log('🔎 Analysis:');

  // Pills without junction entries
  const missingJunctions = Array.from(pillNoteIds).filter(id => !junctionNoteIds.has(id));
  if (missingJunctions.length > 0) {
    console.log(`   ⚠️  Pills WITHOUT junction entries: ${missingJunctions.length}`);
    for (const id of missingJunctions) {
      const pill = pills.find(p => p.noteId === id);
      console.log(`      - ${pill?.reference} (${id})`);
    }
  } else {
    console.log(`   ✅ All pills have junction entries`);
  }

  // Junction entries without pills
  const orphanedJunctions = Array.from(junctionNoteIds).filter(id => !pillNoteIds.has(id));
  if (orphanedJunctions.length > 0) {
    console.log(`   ⚠️  Junction entries WITHOUT pills: ${orphanedJunctions.length}`);
    for (const id of orphanedJunctions) {
      const entry = junctionEntries.find(e => e.scriptureNoteId === id);
      const metadata = await db.select()
        .from(ScriptureMetadata)
        .where(eq(ScriptureMetadata.noteId, id))
        .get();
      console.log(`      - ${metadata?.reference} (${id})`);
    }
  } else {
    console.log(`   ✅ All junction entries have corresponding pills`);
  }

  console.log();
}

diagnose().catch(console.error);
