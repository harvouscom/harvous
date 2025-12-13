import { db, Threads, Notes, NoteThreads, eq, and, count, isNull } from "astro:db";

/**
 * Sleep utility for retry logic
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a database operation with exponential backoff for SQLITE_BUSY errors
 */
async function retryDbOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 50
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (
        (error.message?.includes('SQLITE_BUSY') ||
          error.message?.includes('database is locked')) &&
        attempt < maxRetries - 1
      ) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Ensures the unorganized thread exists for a user and returns its data
 * This function handles all the logic for creating and retrieving the unorganized thread
 */
export async function ensureUnorganizedThread(userId: string) {
  try {
    // First, check if the unorganized thread exists (with retry)
    const existingThread = await retryDbOperation(async () => {
      return await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPublic: Threads.isPublic,
      isPinned: Threads.isPinned,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
    })
    .from(Threads)
    .where(and(
      eq(Threads.userId, userId),
      eq(Threads.id, "thread_unorganized")
    ))
    .get();
    });

    if (!existingThread) {
      try {
        // Create the unorganized thread with consistent properties (with retry)
        await retryDbOperation(async () => {
          await db.insert(Threads).values({
          id: "thread_unorganized",
          title: "Unorganized",
          subtitle: "Notes that haven't been organized into threads yet",
          spaceId: null,
          userId: userId,
          isPublic: true,
          isPinned: false,
          color: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        });
      } catch (insertError: any) {
        // If insert fails due to constraint (thread already exists), re-fetch it
        if (insertError.code === 'SQLITE_CONSTRAINT' || 
            insertError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || 
            insertError.rawCode === 1555 ||
            insertError.message?.includes('UNIQUE constraint failed')) {
          // Another request created the thread - re-fetch it
          const createdThread = await db.select({
            id: Threads.id,
            title: Threads.title,
            subtitle: Threads.subtitle,
            color: Threads.color,
            spaceId: Threads.spaceId,
            isPublic: Threads.isPublic,
            isPinned: Threads.isPinned,
            createdAt: Threads.createdAt,
            updatedAt: Threads.updatedAt,
          })
          .from(Threads)
          .where(and(
            eq(Threads.userId, userId),
            eq(Threads.id, "thread_unorganized")
          ))
          .get();
          
          if (createdThread) {
            // Thread was created by another request, continue with normal flow
          }
        } else {
          console.error("Error creating unorganized thread:", insertError);
          throw insertError; // Re-throw if it's a different error
        }
      }
    }

    // Now check if it has notes (notes with NO junction entries = unorganized) (with retry)
    const noteCount = await retryDbOperation(async () => {
      return await db.select({ count: count() })
      .from(Notes)
      .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(
        eq(Notes.userId, userId),
        isNull(NoteThreads.id) // No junction entry = unorganized
      ))
      .get();
    });
    
    const threadData = {
      id: 'thread_unorganized',
      title: 'Unorganized',
      color: null,
      noteCount: noteCount?.count || 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
    };

    return threadData;
  } catch (error) {
    console.error("Error in ensureUnorganizedThread:", error);
    // Return a fallback thread data structure
    return {
      id: 'thread_unorganized',
      title: 'Unorganized',
      color: null,
      noteCount: 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
    };
  }
}
