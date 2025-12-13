/**
 * Helper function to move scripture notes referenced by a parent note to a thread
 * When a note is moved to a thread, all scripture notes it references should also be moved
 */

import { db, Notes, NoteThreads, NoteScriptureReferences, eq, and } from 'astro:db';

/**
 * Sleep utility for retry logic
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Moves all scripture notes referenced by a parent note to the specified thread
 * @param parentNoteId - The ID of the parent note that references scripture notes
 * @param threadId - The target thread ID to move scripture notes to
 * @param userId - The user ID to verify ownership
 * @returns Promise that resolves when all scripture notes have been processed
 */
export async function moveScriptureNotesToThread(
  parentNoteId: string,
  threadId: string,
  userId: string
): Promise<void> {
  // Don't move scripture notes to unorganized
  if (threadId === 'thread_unorganized') {
    return;
  }

  // Wait longer before starting to let the main transaction complete and release locks
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
        console.log('Database is locked, skipping scripture note move operation');
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
      // No scripture notes to move
      return;
    }

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

        // Get all thread relations for this scripture note in one query
        const existingThreadRelations = await db
          .select()
          .from(NoteThreads)
          .where(eq(NoteThreads.noteId, scriptureNoteId))
          .all();

        // Check if scripture note is already in this thread
        // If it is, skip (scripture notes can be in multiple threads via many-to-many relationship)
        const existingRelation = existingThreadRelations.find(
          (rel) => rel.threadId === threadId
        );

        if (existingRelation) {
          // Already in this thread - skip
          continue;
        }

        // Check if scripture note is currently in unorganized
        const isInUnorganized =
          existingThreadRelations.length === 0 ||
          scriptureNote.threadId === 'thread_unorganized';

        // Add the scripture note to the thread via junction table
        // Scripture notes can be in multiple threads (many-to-many relationship)
        // Retry logic for SQLITE_BUSY errors
        let retries = 3;
        let inserted = false;
        while (retries > 0 && !inserted) {
          try {
            const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await db.insert(NoteThreads).values({
              id: noteThreadId,
              noteId: scriptureNoteId,
              threadId: threadId,
              createdAt: new Date(),
            });
            inserted = true;

            // If scripture note was in unorganized, update the legacy threadId field
            // If it was already in another thread, don't update threadId (keep it in multiple threads)
            if (isInUnorganized && threadId !== 'thread_unorganized') {
              // Retry update as well
              let updateRetries = 3;
              while (updateRetries > 0) {
                try {
                  await db
                    .update(Notes)
                    .set({ threadId: threadId })
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
          } catch (insertError: any) {
            if (
              insertError.message?.includes('SQLITE_BUSY') ||
              insertError.message?.includes('database is locked')
            ) {
              retries--;
              if (retries > 0) {
                await sleep(50 * (4 - retries)); // Exponential backoff: 50ms, 100ms, 150ms
              } else {
                // Give up after retries
                console.error(
                  `Failed to insert scripture note ${scriptureNoteId} after retries:`,
                  insertError
                );
              }
            } else {
              // Not a busy error, throw it
              throw insertError;
            }
          }
        }
      } catch (error: any) {
        // Log error but continue with other scripture notes
        console.error(
          `Error moving scripture note ${scriptureNoteId} to thread:`,
          error
        );
      }
    }

    // Note: We don't update the thread timestamp here because the calling endpoint
    // already updates it. This avoids database lock contention.
  } catch (error: any) {
    // Log error but don't throw - this is a non-critical operation
    console.error(
      `Error moving scripture notes for parent note ${parentNoteId} to thread:`,
      error
    );
  }
}

