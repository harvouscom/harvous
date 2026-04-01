/**
 * Move scripture notes to thread
 */

import { db, first, Notes, NoteThreads, NoteScriptureReferences, eq, and } from '../db';

export async function moveScriptureNotesToThread(
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
          .where(eq(NoteThreads.noteId, scriptureNoteId));

        const existingRelation = existingThreadRelations.find(rel => rel.threadId === threadId);
        if (existingRelation) continue;

        const isInUnorganized = existingThreadRelations.length === 0 || scriptureNote.threadId === 'thread_unorganized';

        const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await db.insert(NoteThreads).values({
          id: noteThreadId,
          noteId: scriptureNoteId,
          threadId: threadId,
          createdAt: new Date().toISOString(),
        });

        if (isInUnorganized && threadId !== 'thread_unorganized') {
          await db.update(Notes).set({ threadId }).where(eq(Notes.id, scriptureNoteId));
        }
      } catch (error: any) {
        console.error(`Error moving scripture note ${scriptureNoteId} to thread:`, error);
      }
    }
  } catch (error: any) {
    console.error(`Error moving scripture notes for parent note ${parentNoteId} to thread:`, error);
  }
}
