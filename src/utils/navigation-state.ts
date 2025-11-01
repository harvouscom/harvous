// Navigation state management using URL-based detection
// This approach doesn't rely on global state that gets reset between page requests

import { db, Threads, Notes, NoteThreads, eq, and, count } from "astro:db";
import { getThreadColorCSS, getThreadGradientCSS } from "./colors";

export interface ActiveThread {
  id: string;
  title: string;
  color: string;
  noteCount: number;
  backgroundGradient: string;
}

// Function to get thread context by thread identifier from database
export async function getThreadContext(threadId: string, userId: string): Promise<ActiveThread | null> {
  try {
    const thread = await db.select({
      id: Threads.id,
      title: Threads.title,
      color: Threads.color,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
    })
    .from(Threads)
    .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
    .get();

    if (!thread) {
      return null;
    }

    // Get note count for this thread using junction table only
    const noteCountResult = await db.select({ count: count() })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(
        eq(NoteThreads.threadId, threadId),
        eq(Notes.userId, userId)
      ))
      .get();

    return {
      id: thread.id,
      title: thread.title,
      color: thread.color || 'blue',
      noteCount: noteCountResult?.count || 0,
      backgroundGradient: getThreadGradientCSS(thread.color),
    };
  } catch (error) {
    console.error("Error getting thread context:", error);
    return null;
  }
}

// Function to detect active thread from current path using real database data
export async function detectActiveThreadFromPath(currentPath: string, userId: string): Promise<ActiveThread | null> {
  try {
    // Check if we're currently on a thread page
    if (currentPath.includes('/thread_') || currentPath.match(/^\/[a-zA-Z0-9_-]+$/)) {
      const threadId = currentPath.split('/').pop();
      if (threadId && threadId !== 'dashboard' && threadId !== 'sign-in' && threadId !== 'sign-up') {
        // Special handling for unorganized thread
        if (threadId === 'thread_unorganized') {
          // Import the ensureUnorganizedThread function
          const { ensureUnorganizedThread } = await import('./unorganized-thread');
          const unorganizedData = await ensureUnorganizedThread(userId);
          if (unorganizedData.noteCount > 0) {
            return {
              id: unorganizedData.id,
              title: unorganizedData.title,
              color: unorganizedData.color,
              noteCount: unorganizedData.noteCount,
              backgroundGradient: unorganizedData.backgroundGradient,
            };
          }
          return null;
        }
        
        return await getThreadContext(threadId, userId);
      }
    }
    
    // Check if we're currently on a note page that belongs to a thread
    if (currentPath.includes('/note_')) {
      const noteId = currentPath.split('/').pop();
      if (noteId) {
        // Look up the note's parent thread
        const note = await db.select({
          threadId: Notes.threadId,
        })
        .from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
        .get();

        if (note) {
          // Special case: if note belongs to unorganized thread, use paper color
          if (note.threadId === "thread_unorganized") {
            return null; // This will use paper color
          }
          // For all other threads, use the thread's color
          return await getThreadContext(note.threadId, userId);
        }
      }
    }
    
    // For dashboard and space pages, don't show a specific thread context
    // This allows the mobile navigation to show "For You" as the default
    if (currentPath === '/dashboard' || currentPath.includes('/space_')) {
      return null;
    }
    
    return null;
  } catch (error) {
    console.error("Error detecting active thread from path:", error);
    return null;
  }
}

// Legacy functions for compatibility (but they won't work reliably in SSR)
export function getActiveThread(): ActiveThread | null {
  // This won't work reliably in SSR - use detectActiveThreadFromPath instead
  return null;
}

export function setActiveThread(thread: ActiveThread): void {
  // This won't work reliably in SSR - use detectActiveThreadFromPath instead
}

export function clearActiveThread(): void {
  // This won't work reliably in SSR - use detectActiveThreadFromPath instead
}
