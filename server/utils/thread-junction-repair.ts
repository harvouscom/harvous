/**
 * Create-only repair for Classic thread visibility: insert missing NoteThreads rows
 * when Notes.threadId already points at a real thread. Does not delete orphans.
 */

import { db, Notes, Threads, NoteThreads, eq } from '../db';
import { nowISO } from '../db/dates';

export async function repairMissingNoteThreadJunctionsForUser(userId: string): Promise<number> {
  const userNotes = await db
    .select({ id: Notes.id, threadId: Notes.threadId })
    .from(Notes)
    .where(eq(Notes.userId, userId));

  const userThreads = await db.select({ id: Threads.id }).from(Threads).where(eq(Threads.userId, userId));
  const threadIdSet = new Set(userThreads.map((t) => t.id));

  const allNoteThreads = await db
    .select({ noteId: NoteThreads.noteId, threadId: NoteThreads.threadId })
    .from(NoteThreads)
    .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
    .where(eq(Notes.userId, userId));

  const noteThreadPairs = new Set(allNoteThreads.map((nt) => `${nt.noteId}::${nt.threadId}`));

  let created = 0;
  for (const note of userNotes) {
    if (!note.threadId || note.threadId === 'thread_unorganized' || !threadIdSet.has(note.threadId)) continue;
    const key = `${note.id}::${note.threadId}`;
    if (noteThreadPairs.has(key)) continue;

    const id = `nt-heal-${note.id}-${note.threadId}-${Date.now()}`;
    try {
      await db.insert(NoteThreads).values({
        id,
        noteId: note.id,
        threadId: note.threadId,
        createdAt: nowISO(),
      });
      noteThreadPairs.add(key);
      created++;
    } catch {
      // unique constraint = already exists, skip
    }
  }

  return created;
}
