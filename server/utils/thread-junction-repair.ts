/**
 * Create-only repair for Classic thread visibility: insert missing NoteThreads rows
 * when Notes.threadId already points at a real thread. Does not delete orphans.
 *
 * Runs on every `/api/navigation/data` load, which is what makes its shape matter. It used to
 * read three whole tables for the account — every note, every thread, every junction — and diff
 * them in JavaScript to find the rows to insert. On a healthy account that is a full scan to
 * discover there is nothing to do, and it grows with the library while navigation is on the
 * critical path of every space-scoped query on Home. Measured at 243ms for thirty notes.
 *
 * The join below asks the database the question directly and gets back only the rows that need
 * repairing, which is almost always none. Same four conditions as the old diff, in the same
 * order of meaning: the note belongs to this reader, it points at a thread, that thread is not
 * the unorganized bucket, that thread is really theirs (the inner join), and no junction for the
 * pair exists yet (the left join's null).
 */

import { db, Notes, Threads, NoteThreads, and, eq, isNotNull, isNull, ne } from '../db';
import { nowISO } from '../db/dates';

export async function repairMissingNoteThreadJunctionsForUser(userId: string): Promise<number> {
  const missing = await db
    .select({ id: Notes.id, threadId: Notes.threadId })
    .from(Notes)
    .innerJoin(Threads, and(eq(Threads.id, Notes.threadId), eq(Threads.userId, userId)))
    .leftJoin(
      NoteThreads,
      and(eq(NoteThreads.noteId, Notes.id), eq(NoteThreads.threadId, Notes.threadId)),
    )
    .where(
      and(
        eq(Notes.userId, userId),
        isNotNull(Notes.threadId),
        ne(Notes.threadId, 'thread_unorganized'),
        isNull(NoteThreads.noteId),
      ),
    );

  let created = 0;
  for (const note of missing) {
    if (!note.threadId) continue;
    const id = `nt-heal-${note.id}-${note.threadId}-${Date.now()}`;
    try {
      await db.insert(NoteThreads).values({
        id,
        noteId: note.id,
        threadId: note.threadId,
        createdAt: nowISO(),
      });
      created++;
    } catch {
      // unique constraint = already exists, skip
    }
  }

  return created;
}
