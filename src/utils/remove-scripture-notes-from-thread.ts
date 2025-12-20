/**
 * Helper function to remove scripture notes from a thread when their parent notes are removed
 * When a note is removed from a thread, scripture notes it references should also be removed
 * if no other notes in that thread still reference them
 */

import { db, Notes, NoteThreads, NoteScriptureReferences, eq, and } from 'astro:db';

/**
 * Sleep utility for retry logic
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Removes scripture notes from a thread when their parent note is removed
 * Only removes scripture notes if no other notes in the thread still reference them
 * @param parentNoteId - The ID of the parent note that was removed from the thread
 * @param threadId - The thread ID the note was removed from
 * @param userId - The user ID to verify ownership
 * @returns Promise that resolves when all scripture notes have been processed
 */
export async function removeScriptureNotesFromThread(
  parentNoteId: string,
  threadId: string,
  userId: string
): Promise<void> {
  // Don't remove scripture notes from unorganized
  if (threadId === 'thread_unorganized') {
    return;
  }

  // Wait before starting to let the main transaction complete and release locks
  // This prevents SQLITE_BUSY errors during page loads
  await sleep(1000);

  try {
    // Try a simple query first to check if database is available
    // If it's locked, skip the entire operation
    try {
      await db
        .select()
        .from(NoteScriptureReferences)
        .limit(1)
        .get();
    } catch (checkError: any) {
      if (
        checkError.message?.includes('SQLITE_BUSY') ||
        checkError.message?.includes('database is locked')
      ) {
        // Database is locked, skip this operation entirely
        // Database is locked, skip operation (silent in production)
        return;
      }
      // Other errors, continue normally
    }

    // Query all scripture notes referenced by the parent note
    const scriptureReferences = await db
      .select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
      .from(NoteScriptureReferences)
      .where(eq(NoteScriptureReferences.noteId, parentNoteId))
      .all();

    if (scriptureReferences.length === 0) {
      // No scripture notes to process
      return;
    }

    // Get all notes currently in the thread (excluding the parent note that was just removed)
    const notesInThread = await db
      .select({ noteId: NoteThreads.noteId })
      .from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId))
      .all();

    const noteIdsInThread = new Set(notesInThread.map(n => n.noteId));

    // Process each scripture note
    for (const ref of scriptureReferences) {
      const scriptureNoteId = ref.scriptureNoteId;

      try {
        // Verify the scripture note exists and belongs to the user
        const scriptureNote = await db
          .select()
          .from(Notes)
          .where(and(eq(Notes.id, scriptureNoteId), eq(Notes.userId, userId)))
          .get();

        if (!scriptureNote) {
          // Scripture note doesn't exist or doesn't belong to user - skip
          continue;
        }

        // Check if the scripture note is in this thread
        const scriptureNoteInThread = await db
          .select()
          .from(NoteThreads)
          .where(
            and(
              eq(NoteThreads.noteId, scriptureNoteId),
              eq(NoteThreads.threadId, threadId)
            )
          )
          .get();

        if (!scriptureNoteInThread) {
          // Scripture note is not in this thread - skip
          continue;
        }

        // Check if any other notes in the thread still reference this scripture note
        let stillReferenced = false;
        for (const noteId of noteIdsInThread) {
          const referenceCheck = await db
            .select()
            .from(NoteScriptureReferences)
            .where(
              and(
                eq(NoteScriptureReferences.noteId, noteId),
                eq(NoteScriptureReferences.scriptureNoteId, scriptureNoteId)
              )
            )
            .limit(1)
            .get();

          if (referenceCheck) {
            // Another note in the thread still references this scripture note
            stillReferenced = true;
            break;
          }
        }

        // If no other notes in the thread reference this scripture note, remove it from the thread
        if (!stillReferenced) {
          // Remove the scripture note from the thread via junction table
          // Retry logic for SQLITE_BUSY errors
          let retries = 3;
          let deleted = false;
          while (retries > 0 && !deleted) {
            try {
              await db
                .delete(NoteThreads)
                .where(
                  and(
                    eq(NoteThreads.noteId, scriptureNoteId),
                    eq(NoteThreads.threadId, threadId)
                  )
                );
              deleted = true;

              // Check if this was the last thread for the scripture note
              const remainingThreads = await db
                .select()
                .from(NoteThreads)
                .where(eq(NoteThreads.noteId, scriptureNoteId))
                .all();

              // If scripture note has no more threads, update legacy threadId to unorganized
              if (remainingThreads.length === 0) {
                let updateRetries = 3;
                while (updateRetries > 0) {
                  try {
                    await db
                      .update(Notes)
                      .set({ threadId: 'thread_unorganized' })
                      .where(eq(Notes.id, scriptureNoteId));
                    break;
                  } catch (updateError: any) {
                    if (
                      updateError.message?.includes('SQLITE_BUSY') ||
                      updateError.message?.includes('database is locked')
                    ) {
                      updateRetries--;
                      if (updateRetries > 0) {
                        await sleep(50 * (4 - updateRetries)); // Exponential backoff
                      }
                    } else {
                      throw updateError;
                    }
                  }
                }
              }
            } catch (deleteError: any) {
              if (
                deleteError.message?.includes('SQLITE_BUSY') ||
                deleteError.message?.includes('database is locked')
              ) {
                retries--;
                if (retries > 0) {
                  await sleep(50 * (4 - retries)); // Exponential backoff: 50ms, 100ms, 150ms
                } else {
                  // Give up after retries
                  console.error(
                    `Failed to remove scripture note ${scriptureNoteId} from thread after retries:`,
                    deleteError
                  );
                }
              } else {
                // Not a busy error, throw it
                throw deleteError;
              }
            }
          }
        }
      } catch (error: any) {
        // Log error but continue with other scripture notes
        console.error(
          `Error removing scripture note ${scriptureNoteId} from thread:`,
          error
        );
      }
    }
  } catch (error: any) {
    // Log error but don't throw - this is a non-critical operation
    console.error(
      `Error removing scripture notes for parent note ${parentNoteId} from thread:`,
      error
    );
  }
}

