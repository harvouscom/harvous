import { db, Threads, Notes, Spaces, NoteThreads, eq, and, desc, count, or, ne, isNull } from "astro:db";
import { getThreadColorCSS, getThreadGradientCSS } from "./colors";

// Helper function to format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

  if (diffInDays > 0) {
    return diffInDays === 1 ? "1 day ago" : `${diffInDays} days ago`;
  } else if (diffInHours > 0) {
    return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;
  } else if (diffInMinutes > 0) {
    return diffInMinutes === 1 ? "1 minute ago" : `${diffInMinutes} minutes ago`;
  } else {
    return "Just now";
  }
}

// Helper function to find unorganized thread (don't create it)
async function findUnorganizedThread(userId: string) {
  try {
    const unorganizedThread = await db.select({
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

    return unorganizedThread;
  } catch (error) {
    console.error("Error finding unorganized thread:", error);
    return null;
  }
}


// Fetch all threads with note counts (excluding unorganized thread)
export async function getAllThreadsWithCounts(userId: string) {
  try {
    const threads = await db.select({
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
      ne(Threads.id, "thread_unorganized") // Exclude unorganized thread from dashboard display
    ))
    .orderBy(desc(Threads.isPinned), desc(Threads.updatedAt || Threads.createdAt));

    // Get note counts for each thread
    const threadsWithCounts = await Promise.all(
      threads.map(async (thread) => {
        const noteCount = await db.select({ count: count() })
          .from(Notes)
          .where(eq(Notes.threadId, thread.id))
          .get();

        return {
          ...thread,
          noteCount: noteCount?.count || 0,
          lastUpdated: formatRelativeTime(thread.updatedAt || thread.createdAt),
          accentColor: getThreadColorCSS(thread.color),
          backgroundGradient: getThreadGradientCSS(thread.color),
        };
      })
    );

    // Get count for unorganized notes
    const unorganizedThread = await findUnorganizedThread(userId);
    const unorganizedNoteCount = unorganizedThread ? await db.select({ count: count() })
      .from(Notes)
      .where(eq(Notes.threadId, unorganizedThread.id))
      .get() : { count: 0 };

    // Don't add unorganized thread to the threads list - it should be hidden from dashboard display
    // The unorganized thread exists for data organization but shouldn't appear in navigation

    return threadsWithCounts;
  } catch (error) {
    console.error("Error fetching threads:", error);
    // Return empty array if database fails - unorganized thread should not be displayed
    return [];
  }
}

// Fetch spaces with their content counts (only created spaces)
export async function getSpacesWithCounts(userId: string) {
  try {
    const spaces = await db.select({
      id: Spaces.id,
      title: Spaces.title,
      description: Spaces.description,
      color: Spaces.color,
      backgroundGradient: Spaces.backgroundGradient,
      isPublic: Spaces.isPublic,
      isActive: Spaces.isActive,
      createdAt: Spaces.createdAt,
      updatedAt: Spaces.updatedAt,
    })
    .from(Spaces)
    .where(eq(Spaces.userId, userId))
    .orderBy(desc(Spaces.isActive), desc(Spaces.updatedAt || Spaces.createdAt));

    // Get content counts for each space
    const spacesWithCounts = await Promise.all(
      spaces.map(async (space) => {
        // Count threads in this space
        const threadCount = await db.select({ count: count() })
          .from(Threads)
          .where(eq(Threads.spaceId, space.id))
          .get();

        // Count notes directly in this space (not in threads)
        const standaloneNoteCount = await db.select({ count: count() })
          .from(Notes)
          .where(and(eq(Notes.spaceId, space.id), eq(Notes.threadId, "thread_unorganized")))
          .get();

        // Count all notes in this space (both in threads and standalone)
        const totalNoteCount = await db.select({ count: count() })
          .from(Notes)
          .where(eq(Notes.spaceId, space.id))
          .get();

        return {
          ...space,
          threadCount: threadCount?.count || 0,
          standaloneNoteCount: standaloneNoteCount?.count || 0,
          totalItemCount: (threadCount?.count || 0) + (standaloneNoteCount?.count || 0),
          totalNoteCount: totalNoteCount?.count || 0,
          lastUpdated: formatRelativeTime(space.updatedAt || space.createdAt),
        };
      })
    );

    return spacesWithCounts;
  } catch (error) {
    console.error("Error fetching spaces:", error);
    return [];
  }
}

// Fetch threads for a specific space
export async function getThreadsForSpace(spaceId: string, userId: string) {
  try {
    const threads = await db.select({
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
    .where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, userId)))
    .orderBy(desc(Threads.isPinned), desc(Threads.updatedAt || Threads.createdAt));

    // Get note counts for each thread
    const threadsWithCounts = await Promise.all(
      threads.map(async (thread) => {
        const noteCount = await db.select({ count: count() })
          .from(Notes)
          .where(eq(Notes.threadId, thread.id))
          .get();

        return {
          ...thread,
          noteCount: noteCount?.count || 0,
          lastUpdated: formatRelativeTime(thread.updatedAt || thread.createdAt),
          accentColor: getThreadColorCSS(thread.color),
          backgroundGradient: getThreadGradientCSS(thread.color),
        };
      })
    );

    return threadsWithCounts;
  } catch (error) {
    console.error("Error fetching threads for space:", error);
    return [];
  }
}

// Fetch notes for a specific thread
export async function getNotesForThread(threadId: string, userId: string, limit = 20) {
  try {
    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      isPublic: Notes.isPublic,
      isFeatured: Notes.isFeatured,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(and(eq(Notes.threadId, threadId), eq(Notes.userId, userId)))
    .orderBy(desc(Notes.updatedAt || Notes.createdAt))
    .limit(limit);

    return notes.map(note => ({
      ...note,
      lastUpdated: formatRelativeTime(note.updatedAt || note.createdAt),
    }));
  } catch (error) {
    console.error("Error fetching notes for thread:", error);
    return [];
  }
}

// Fetch notes for a specific space (both in threads and standalone)
export async function getNotesForSpace(spaceId: string, userId: string, limit = 20) {
  try {
    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      isPublic: Notes.isPublic,
      isFeatured: Notes.isFeatured,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(and(eq(Notes.spaceId, spaceId), eq(Notes.userId, userId)))
    .orderBy(desc(Notes.updatedAt || Notes.createdAt))
    .limit(limit);

    return notes.map(note => ({
      ...note,
      lastUpdated: formatRelativeTime(note.updatedAt || note.createdAt),
    }));
  } catch (error) {
    console.error("Error fetching notes for space:", error);
    return [];
  }
}

// Fetch notes for dashboard (all notes)
export async function getNotesForDashboard(userId: string, limit = 10) {
  try {
    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      isPublic: Notes.isPublic,
      isFeatured: Notes.isFeatured,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .orderBy(desc(Notes.updatedAt || Notes.createdAt))
    .limit(limit);

    return notes.map(note => ({
      ...note,
      lastUpdated: formatRelativeTime(note.updatedAt || note.createdAt),
    }));
  } catch (error) {
    console.error("Error fetching notes:", error);
    return [];
  }
}

// Get inbox count (individual notes + threads that are unorganized)
export async function getInboxCount(userId: string) {
  try {
    // Count individual notes in unorganized thread
    const unorganizedThread = await findUnorganizedThread(userId);
    const individualNotesCount = unorganizedThread ? await db.select({ count: count() })
      .from(Notes)
      .where(eq(Notes.threadId, unorganizedThread.id))
      .get() : { count: 0 };

    // Count threads that are not in any space (unorganized threads)
    const unorganizedThreadsCount = await db.select({ count: count() })
      .from(Threads)
      .where(and(
        eq(Threads.userId, userId),
        isNull(Threads.spaceId),
        ne(Threads.title, "Unorganized") // Exclude the unorganized thread itself
      ))
      .get();

    // Total inbox count = individual notes + unorganized threads
    const totalCount = (individualNotesCount?.count || 0) + (unorganizedThreadsCount?.count || 0);
    
    return totalCount;
  } catch (error) {
    console.error("Error fetching inbox count:", error);
    return 0;
  }
}

// Get inbox display count (only unorganized threads, matching what's shown in the inbox section)
export async function getInboxDisplayCount(userId: string) {
  try {
    // Get featured content to count unorganized threads
    const featuredContent = await getFeaturedContent(userId);
    const inboxContent = featuredContent.filter(item => item.type === 'thread');
    
    return inboxContent.length;
  } catch (error) {
    console.error("Error fetching inbox display count:", error);
    return 0;
  }
}

// Fetch featured content (pinned threads and recent unassigned notes + unorganized threads)
export async function getFeaturedContent(userId: string) {
  console.log("getFeaturedContent called with userId:", userId);
  try {
    // Get pinned threads
    const pinnedThreads = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPublic: Threads.isPublic,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
    })
    .from(Threads)
    .where(and(eq(Threads.userId, userId), eq(Threads.isPinned, true)))
    .orderBy(desc(Threads.updatedAt || Threads.createdAt))
    .limit(3);

    // Get recent individual notes (in unorganized thread)
    const unorganizedThread = await findUnorganizedThread(userId);
    console.log("Unorganized thread found:", unorganizedThread);
    const recentIndividualNotes = unorganizedThread ? await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      isPublic: Notes.isPublic,
      isFeatured: Notes.isFeatured,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(eq(Notes.threadId, unorganizedThread.id))
    .orderBy(desc(Notes.updatedAt || Notes.createdAt))
    .limit(10) : []; // Increased limit to include all individual notes
    
    console.log("Recent individual notes found:", recentIndividualNotes.length);

    // Get unorganized threads (threads not in any space, excluding the unorganized thread itself)
    const unorganizedThreads = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPublic: Threads.isPublic,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
    })
    .from(Threads)
    .where(and(
      eq(Threads.userId, userId),
      isNull(Threads.spaceId),
      ne(Threads.id, "thread_unorganized") // Exclude the unorganized thread by ID
    ))
    .orderBy(desc(Threads.updatedAt || Threads.createdAt))
    .limit(2);

    const featuredThreads = pinnedThreads.map(thread => ({
      id: `feat-thread-${thread.id}`,
      type: "thread" as const,
      variant: "Thread" as const,
      title: thread.title,
      content: thread.subtitle || "Thread", // Use subtitle or fallback
      threadId: thread.id, // Full ID including prefix
      spaceId: thread.spaceId,
      lastUpdated: formatRelativeTime(thread.updatedAt || thread.createdAt),
      updatedAt: thread.updatedAt || thread.createdAt, // Keep actual timestamp for sorting
      isPrivate: !thread.isPublic,
      accentColor: getThreadColorCSS(thread.color),
    }));

    const featuredNotes = recentIndividualNotes.map(note => ({
      id: `feat-note-${note.id}`,
      type: "note" as const,
      variant: "Note" as const,
      title: note.title || "Untitled Note",
      content: note.content.substring(0, 100) + (note.content.length > 100 ? "..." : ""),
      noteId: note.id, // Full ID including prefix
      threadId: note.threadId, // These are in unorganized thread
      spaceId: note.spaceId,
      lastUpdated: formatRelativeTime(note.updatedAt || note.createdAt),
      updatedAt: note.updatedAt || note.createdAt, // Keep actual timestamp for sorting
    }));

    const unorganizedThreadItems = unorganizedThreads.map(thread => ({
      id: `feat-thread-${thread.id}`,
      type: "thread" as const,
      variant: "Thread" as const,
      title: thread.title,
      content: thread.subtitle || "Thread", // Use subtitle or fallback
      threadId: thread.id, // Full ID including prefix
      spaceId: thread.spaceId,
      lastUpdated: formatRelativeTime(thread.updatedAt || thread.createdAt),
      updatedAt: thread.updatedAt || thread.createdAt, // Keep actual timestamp for sorting
      isPrivate: !thread.isPublic,
      accentColor: getThreadColorCSS(thread.color),
    }));

    // Combine and sort by actual timestamp (newest first)
    const allFeatured = [...featuredThreads, ...featuredNotes, ...unorganizedThreadItems]
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        return bTime - aTime; // Newest first
      })
      .slice(0, 10); // Increased limit to include all items

    return allFeatured;
  } catch (error) {
    console.error("Error fetching featured content:", error);
    return [];
  }
}

// Get content items for the main list (organized content + unorganized notes)
export async function getContentItems(userId: string, limit = 20) {
  try {
    const [threads, assignedNotes, unorganizedNotes] = await Promise.all([
      getAllThreadsWithCounts(userId),
      getAssignedNotesForDashboard(userId, limit),
      getUnorganizedNotesForDashboard(userId, limit)
    ]);

    const threadItems = threads.map(thread => ({
      id: `thread-${thread.id}`,
      type: "thread" as const,
      title: thread.title,
      subtitle: `${thread.noteCount} notes`,
      count: thread.noteCount,
      threadId: thread.id, // Full ID including prefix
      spaceId: thread.spaceId,
      lastUpdated: thread.lastUpdated,
      updatedAt: thread.updatedAt || thread.createdAt, // Keep actual timestamp for sorting
      isPrivate: !thread.isPublic,
      accentColor: thread.accentColor,
    }));

    const assignedNoteItems = assignedNotes.map(note => ({
      id: `note-${note.id}`,
      type: "note" as const,
      title: note.title || "Untitled Note",
      content: note.content.substring(0, 150) + (note.content.length > 150 ? "..." : ""),
      noteId: note.id, // Full ID including prefix
      threadId: note.threadId,
      spaceId: note.spaceId,
      lastUpdated: note.lastUpdated,
      updatedAt: note.updatedAt || note.createdAt, // Keep actual timestamp for sorting
    }));

    const unorganizedNoteItems = unorganizedNotes.map(note => ({
      id: `note-${note.id}`,
      type: "note" as const,
      title: note.title || "Untitled Note",
      content: note.content.substring(0, 150) + (note.content.length > 150 ? "..." : ""),
      noteId: note.id, // Full ID including prefix
      threadId: note.threadId,
      spaceId: note.spaceId,
      lastUpdated: note.lastUpdated,
      updatedAt: note.updatedAt || note.createdAt, // Keep actual timestamp for sorting
    }));

    // Combine and sort by actual timestamp (newest first)
    // This ensures notes from unorganized threads are sorted by their actual update time
    const allItems = [...threadItems, ...assignedNoteItems, ...unorganizedNoteItems]
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        return bTime - aTime; // Newest first
      })
      .slice(0, limit);

    return allItems;
  } catch (error) {
    console.error("Error fetching content items:", error);
    return [];
  }
}

// Fetch unorganized notes for dashboard (notes in unorganized thread)
export async function getUnorganizedNotesForDashboard(userId: string, limit = 10) {
  try {
    const unorganizedThread = await findUnorganizedThread(userId);
    if (!unorganizedThread) {
      return [];
    }

    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      isPublic: Notes.isPublic,
      isFeatured: Notes.isFeatured,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(and(
      eq(Notes.userId, userId),
      eq(Notes.threadId, unorganizedThread.id)
    ))
    .orderBy(desc(Notes.updatedAt || Notes.createdAt))
    .limit(limit);

    return notes.map(note => ({
      ...note,
      lastUpdated: formatRelativeTime(note.updatedAt || note.createdAt),
    }));
  } catch (error) {
    console.error("Error fetching unorganized notes:", error);
    return [];
  }
}

// Fetch assigned notes for dashboard (excludes unorganized notes)
export async function getAssignedNotesForDashboard(userId: string, limit = 10) {
  try {
    const unorganizedThread = await findUnorganizedThread(userId);
    if (!unorganizedThread) {
      // If no unorganized thread exists, return all notes
      const notes = await db.select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        threadId: Notes.threadId,
        spaceId: Notes.spaceId,
        simpleNoteId: Notes.simpleNoteId,
        isPublic: Notes.isPublic,
        isFeatured: Notes.isFeatured,
        createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .where(eq(Notes.userId, userId))
      .orderBy(desc(Notes.updatedAt || Notes.createdAt))
      .limit(limit);

      return notes.map(note => ({
        ...note,
        lastUpdated: formatRelativeTime(note.updatedAt || note.createdAt),
      }));
    }

    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      isPublic: Notes.isPublic,
      isFeatured: Notes.isFeatured,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(and(
      eq(Notes.userId, userId),
      ne(Notes.threadId, unorganizedThread.id)
    ))
    .orderBy(desc(Notes.updatedAt || Notes.createdAt))
    .limit(limit);

    return notes.map(note => ({
      ...note,
      lastUpdated: formatRelativeTime(note.updatedAt || note.createdAt),
    }));
  } catch (error) {
    console.error("Error fetching assigned notes:", error);
    return [];
  }
}
