import { db, Threads, Notes, eq, and, count } from "astro:db";

/**
 * Ensures the unorganized thread exists for a user and returns its data
 * This function handles all the logic for creating and retrieving the unorganized thread
 */
export async function ensureUnorganizedThread(userId: string) {
  try {
    // First, check if the unorganized thread exists
    const existingThread = await db.select({
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

    if (!existingThread) {
      try {
        // Create the unorganized thread with consistent properties
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
        console.log("✅ Created unorganized thread for user:", userId);
      } catch (insertError: any) {
        // If insert fails due to constraint (thread already exists), that's fine
        if (insertError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || insertError.rawCode === 1555) {
          console.log("ℹ️ Unorganized thread already exists for user:", userId);
        } else {
          console.error("❌ Error creating unorganized thread:", insertError);
          throw insertError; // Re-throw if it's a different error
        }
      }
    }

    // Now check if it has notes and return the thread data
    const noteCount = await db.select({ count: count() })
      .from(Notes)
      .where(and(
        eq(Notes.userId, userId),
        eq(Notes.threadId, "thread_unorganized")
      ))
      .get();
    
    const threadData = {
      id: 'thread_unorganized',
      title: 'Unorganized',
      color: null,
      noteCount: noteCount?.count || 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
    };

    return threadData;
  } catch (error) {
    console.error("❌ Error in ensureUnorganizedThread:", error);
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
