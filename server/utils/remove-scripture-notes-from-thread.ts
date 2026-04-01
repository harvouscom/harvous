/**
 * Remove scripture notes from thread
 */

import { db, first, Notes, NoteThreads, NoteScriptureReferences, eq, and } from '../db';

export async function removeScriptureNotesFromThread(
  parentNoteId: string,
  threadId: string,
  userId: string
): Promise<void> {
  if (threadId === 'thread_unorganized') return;

  try {
    const scriptureReferences = await db
      .select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
      .from(NoteScriptureReferences)
      .where(eq(NoteScriptureReferences.noteId, parentNoteId));

    if (scriptureReferences.length === 0) return;

    const notesInThread = await db
      .select({ noteId: NoteThreads.noteId })
      .from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId));

    const noteIdsInThread = new Set(notesInThread.map(n => n.noteId));

    for (const ref of scriptureReferences) {
      const scriptureNoteId = ref.scriptureNoteId;

      try {
        const scriptureNote = first(await db.select()
          .from(Notes)
          .where(and(eq(Notes.id, scriptureNoteId), eq(Notes.userId, userId)))
          .limit(1));

        if (!scriptureNote) continue;

        const scriptureNoteInThread = first(await db.select()
          .from(NoteThreads)
          .where(and(eq(NoteThreads.noteId, scriptureNoteId), eq(NoteThreads.threadId, threadId)))
          .limit(1));

        if (!scriptureNoteInThread) continue;

        let stillReferenced = false;
        for (const noteId of noteIdsInThread) {
          const referenceCheck = first(await db.select()
            .from(NoteScriptureReferences)
            .where(and(
              eq(NoteScriptureReferences.noteId, noteId),
              eq(NoteScriptureReferences.scriptureNoteId, scriptureNoteId)
            ))
            .limit(1));

          if (referenceCheck) {
            stillReferenced = true;
            break;
          }
        }

        if (!stillReferenced) {
          await db.delete(NoteThreads)
            .where(and(eq(NoteThreads.noteId, scriptureNoteId), eq(NoteThreads.threadId, threadId)));

          const remainingThreads = await db.select()
            .from(NoteThreads)
            .where(eq(NoteThreads.noteId, scriptureNoteId));

          if (remainingThreads.length === 0) {
            await db.update(Notes).set({ threadId: 'thread_unorganized' }).where(eq(Notes.id, scriptureNoteId));
          } else if (scriptureNote.threadId === threadId) {
            await db.update(Notes).set({ threadId: remainingThreads[0].threadId }).where(eq(Notes.id, scriptureNoteId));
          }
        }
      } catch (error: any) {
        console.error(`Error removing scripture note ${scriptureNoteId} from thread:`, error);
      }
    }
  } catch (error: any) {
    console.error(`Error removing scripture notes for parent note ${parentNoteId} from thread:`, error);
  }
}
