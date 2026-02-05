/**
 * Database cleanup script to create missing NoteScriptureReferences junction entries
 * for notes that contain scripture pills in their content but have no junction row.
 * Run with: npx astro db execute db/fix-missing-scripture-junctions.mts
 */

import { db, Notes, NoteScriptureReferences, ScriptureMetadata, eq, and } from 'astro:db';

const PILL_PATTERNS: Array<{ re: RegExp; refIdx: number; noteIdIdx: number }> = [
  { re: /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
  { re: /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 2, noteIdIdx: 1 },
  { re: /<span[^>]*class\s*=\s*["'][^"']*scripture-pill[^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
  { re: /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
  { re: /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 2, noteIdIdx: 1 },
  { re: /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
  { re: /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 2, noteIdIdx: 1 },
];

function extractPillsFromContent(content: string): Array<{ scriptureNoteId: string; reference: string }> {
  const seen = new Set<string>();
  const pills: Array<{ scriptureNoteId: string; reference: string }> = [];

  for (const { re, refIdx, noteIdIdx } of PILL_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const scriptureNoteId = m[noteIdIdx];
      const reference = m[refIdx];
      if (
        scriptureNoteId &&
        scriptureNoteId !== 'pending' &&
        scriptureNoteId !== 'null' &&
        scriptureNoteId !== '' &&
        reference &&
        !seen.has(scriptureNoteId)
      ) {
        seen.add(scriptureNoteId);
        pills.push({ scriptureNoteId, reference });
      }
    }
  }
  return pills;
}

async function run() {
  console.log('Starting fix for missing scripture junction entries...\n');

  const defaultNotes = await db.select({ id: Notes.id, userId: Notes.userId, content: Notes.content })
    .from(Notes)
    .where(eq(Notes.noteType, 'default'))
    .all();

  console.log(`Notes (default type) to scan: ${defaultNotes.length}`);

  let pillsFound = 0;
  let junctionsCreated = 0;
  let errors = 0;
  const notesWithPills: Array<{ noteId: string; userId: string; pills: Array<{ scriptureNoteId: string; reference: string }> }> = [];

  for (const note of defaultNotes) {
    if (!note.content || typeof note.content !== 'string') continue;
    const pills = extractPillsFromContent(note.content);
    if (pills.length === 0) continue;
    pillsFound += pills.length;
    notesWithPills.push({ noteId: note.id, userId: note.userId, pills });
  }

  console.log(`Notes containing scripture pills: ${notesWithPills.length}`);
  console.log(`Total pills found in content: ${pillsFound}\n`);

  for (const { noteId, userId, pills } of notesWithPills) {
    for (const { scriptureNoteId, reference } of pills) {
      try {
        const existing = await db.select()
          .from(NoteScriptureReferences)
          .where(
            and(
              eq(NoteScriptureReferences.noteId, noteId),
              eq(NoteScriptureReferences.scriptureNoteId, scriptureNoteId)
            )
          )
          .limit(1)
          .get();

        if (existing) continue;

        const scriptureNote = await db.select()
          .from(Notes)
          .where(
            and(
              eq(Notes.id, scriptureNoteId),
              eq(Notes.userId, userId),
              eq(Notes.noteType, 'scripture')
            )
          )
          .limit(1)
          .get();

        if (!scriptureNote) {
          console.warn(`  Skip: scripture note ${scriptureNoteId} not found or not owned by user (note ${noteId}, ref ${reference})`);
          continue;
        }

        await db.insert(NoteScriptureReferences).values({
          id: `note-scripture-${noteId}-${scriptureNoteId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          noteId,
          scriptureNoteId,
          createdAt: new Date(),
        });
        junctionsCreated++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE constraint failed')) {
          // Race or already inserted
          continue;
        }
        errors++;
        console.error(`  Error creating junction noteId=${noteId} scriptureNoteId=${scriptureNoteId}:`, msg);
      }
    }
  }

  console.log('--- Summary ---');
  console.log(`Junction entries created: ${junctionsCreated}`);
  if (errors > 0) {
    console.log(`Errors: ${errors}`);
  }
  console.log('\nDone.');
}

run().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
