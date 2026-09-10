/**
 * Archive note review items that can no longer carry a question.
 *
 * The note ladder grades what a note was about, so a note with no name, no cited passage and no
 * link has nothing to ask. Items made before the ladder existed are already in the table, and
 * the queue drops them on read — this makes that explicit rather than leaving rows that are
 * permanently invisible and permanently active.
 *
 * Reversible: it sets `status`, it does not delete. Prints every row before and after.
 */
import 'dotenv/config';
import { db, ReviewItems, Notes, NoteConnections, NoteScriptureReferences, eq, and, or, inArray } from '../db';
import { ScriptureMetadata } from '../db/schema';

const uid = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1]
  ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const apply = process.argv.includes('--apply');

const items = await db
  .select()
  .from(ReviewItems)
  .where(and(eq(ReviewItems.userId, uid), eq(ReviewItems.kind, 'note'), eq(ReviewItems.status, 'active')));

const unaskable: string[] = [];
for (const item of items) {
  if (!item.noteId) continue;
  const [note] = await db
    .select({ title: Notes.title, content: Notes.content, enc: Notes.contentEncrypted })
    .from(Notes)
    .where(and(eq(Notes.id, item.noteId), eq(Notes.userId, uid)))
    .limit(1);

  const viaPill = await db
    .select({ id: NoteScriptureReferences.noteId })
    .from(NoteScriptureReferences)
    .innerJoin(ScriptureMetadata, eq(NoteScriptureReferences.scriptureNoteId, ScriptureMetadata.noteId))
    .where(eq(NoteScriptureReferences.noteId, item.noteId));
  const own = await db
    .select({ id: ScriptureMetadata.noteId })
    .from(ScriptureMetadata)
    .where(eq(ScriptureMetadata.noteId, item.noteId));
  const links = await db
    .select({ id: NoteConnections.id })
    .from(NoteConnections)
    .where(and(eq(NoteConnections.userId, uid), or(eq(NoteConnections.fromNoteId, item.noteId), eq(NoteConnections.toNoteId, item.noteId))));

  const passages = viaPill.length + own.length;
  const askable = passages > 0 || links.length > 0;
  console.log(
    `${item.id} note=${item.noteId} title=${JSON.stringify(note?.title ?? null)} ` +
      `passages=${passages} links=${links.length} -> ${askable ? 'keep' : 'ARCHIVE'}`,
  );
  if (!askable) unaskable.push(item.id);
}

if (!unaskable.length) {
  console.log('\nnothing to archive');
  process.exit(0);
}
if (!apply) {
  console.log(`\n${unaskable.length} would be archived. Re-run with --apply.`);
  process.exit(0);
}

const updated = await db
  .update(ReviewItems)
  .set({ status: 'archived', updatedAt: new Date() })
  .where(and(eq(ReviewItems.userId, uid), inArray(ReviewItems.id, unaskable)))
  .returning({ id: ReviewItems.id, status: ReviewItems.status });
console.log(`\narchived ${updated.length}:`, updated.map((r) => `${r.id}=${r.status}`).join(', '));
console.log(`  to undo: UPDATE "ReviewItems" SET status='active' WHERE id IN (${unaskable.map((i) => `'${i}'`).join(', ')});`);
process.exit(0);
