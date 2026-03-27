/**
 * Remove scripture notes from thread — Drizzle port of src/utils/remove-scripture-notes-from-thread.ts
 */

import { db, first, Notes, NoteThreads, NoteScriptureReferences, eq, and } from '../db';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function removeScriptureNotesFromThread(
  parentNoteId: string,
  threadId: string,
  userId: string
): Promise<void> {
  if (threadId === 'thread_unorganized') return;

  await sleep(1000);

  try {
    try {
      first(await db.select().from(NoteScriptureReferences).limit(1));
    } catch (checkError: any) {
      if (checkError.message?.includes('SQLITE_BUSY') || checkError.message?.includes('database is locked')) {
        return;
      }
    }

    const scriptureReferences = await db
      .select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
      .from(NoteScriptureReferences)
      .where(eq(NoteScriptureReferences.noteId, parentNoteId))
      ;

    if (scriptureReferences.length === 0) return;

    const notesInThread = await db
      .select({ noteId: NoteThreads.noteId })
      .from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId))
      ;

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
          let retries = 3;
          let deleted = false;
          while (retries > 0 && !deleted) {
            try {
              await db.delete(NoteThreads)
                .where(and(eq(NoteThreads.noteId, scriptureNoteId), eq(NoteThreads.threadId, threadId)));
              deleted = true;

              const remainingThreads = await db.select()
                .from(NoteThreads)
                .where(eq(NoteThreads.noteId, scriptureNoteId))
                ;

              if (remainingThreads.length === 0) {
                let updateRetries = 3;
                while (updateRetries > 0) {
                  try {
                    await db.update(Notes).set({ threadId: 'thread_unorganized' }).where(eq(Notes.id, scriptureNoteId));
                    break;
                  } catch (updateError: any) {
                    if (updateError.message?.includes('SQLITE_BUSY') || updateError.message?.includes('database is locked')) {
                      updateRetries--;
                      if (updateRetries > 0) await sleep(50 * (4 - updateRetries));
                    } else {
                      throw updateError;
                    }
                  }
                }
              } else if (scriptureNote.threadId === threadId) {
                // If removed thread was the primary, update to next remaining thread
                let updateRetries = 3;
                while (updateRetries > 0) {
                  try {
                    await db.update(Notes).set({ threadId: remainingThreads[0].threadId }).where(eq(Notes.id, scriptureNoteId));
                    break;
                  } catch (updateError: any) {
                    if (updateError.message?.includes('SQLITE_BUSY') || updateError.message?.includes('database is locked')) {
                      updateRetries--;
                      if (updateRetries > 0) await sleep(50 * (4 - updateRetries));
                    } else {
                      throw updateError;
                    }
                  }
                }
              }
            } catch (deleteError: any) {
              if (deleteError.message?.includes('SQLITE_BUSY') || deleteError.message?.includes('database is locked')) {
                retries--;
                if (retries > 0) await sleep(50 * (4 - retries));
                else console.error(`Failed to remove scripture note ${scriptureNoteId} from thread after retries:`, deleteError);
              } else {
                throw deleteError;
              }
            }
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
