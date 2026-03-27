/**
 * Move scripture notes to thread — Drizzle port of src/utils/move-scripture-notes-to-thread.ts
 */

import { db, first, Notes, NoteThreads, NoteScriptureReferences, eq, and } from '../db';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function moveScriptureNotesToThread(
  parentNoteId: string,
  threadId: string,
  userId: string
): Promise<void> {
  if (threadId === 'thread_unorganized') return;

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

    for (const ref of scriptureReferences) {
      const scriptureNoteId = ref.scriptureNoteId;

      try {
        const scriptureNote = first(await db.select()
          .from(Notes)
          .where(and(eq(Notes.id, scriptureNoteId), eq(Notes.userId, userId)))
          .limit(1));

        if (!scriptureNote) continue;

        const existingThreadRelations = await db.select()
          .from(NoteThreads)
          .where(eq(NoteThreads.noteId, scriptureNoteId))
          ;

        const existingRelation = existingThreadRelations.find(rel => rel.threadId === threadId);
        if (existingRelation) continue;

        const isInUnorganized = existingThreadRelations.length === 0 || scriptureNote.threadId === 'thread_unorganized';

        let retries = 3;
        let inserted = false;
        while (retries > 0 && !inserted) {
          try {
            const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await db.insert(NoteThreads).values({
              id: noteThreadId,
              noteId: scriptureNoteId,
              threadId: threadId,
              createdAt: new Date().toISOString(),
            });
            inserted = true;

            if (isInUnorganized && threadId !== 'thread_unorganized') {
              let updateRetries = 3;
              while (updateRetries > 0) {
                try {
                  await db.update(Notes).set({ threadId }).where(eq(Notes.id, scriptureNoteId));
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
          } catch (insertError: any) {
            if (insertError.message?.includes('SQLITE_BUSY') || insertError.message?.includes('database is locked')) {
              retries--;
              if (retries > 0) await sleep(50 * (4 - retries));
              else console.error(`Failed to insert scripture note ${scriptureNoteId} after retries:`, insertError);
            } else {
              throw insertError;
            }
          }
        }
      } catch (error: any) {
        console.error(`Error moving scripture note ${scriptureNoteId} to thread:`, error);
      }
    }
  } catch (error: any) {
    console.error(`Error moving scripture notes for parent note ${parentNoteId} to thread:`, error);
  }
}
