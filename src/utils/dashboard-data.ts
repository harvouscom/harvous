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

// Helper function to find unorganized thread (create it if it doesn't exist)
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

    if (unorganizedThread) {
      return unorganizedThread;
    }

    // If not found, create it
    console.log("Creating unorganized thread for user:", userId);
    try {
      const newUnorganizedThread = await db.insert(Threads).values({
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
      }).returning().get();

      console.log("✅ Created unorganized thread:", newUnorganizedThread);
      return newUnorganizedThread;
    } catch (createError: any) {
      // If creation failed due to constraint, it means another process created it
      if (createError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || createError.rawCode === 1555) {
        console.log("Unorganized thread already exists, fetching it...");
        // Try to fetch it again
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
        
        return existingThread;
      }
      throw createError;
    }
  } catch (error) {
    console.error("Error finding/creating unorganized thread:", error);
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

// Get inbox count (reserved for external content only - no user-generated content)
export async function getInboxCount(userId: string) {
  try {
    // IMPORTANT: The inbox section is reserved for external content only
    // User-generated notes and threads should NEVER appear in the inbox
    // This includes individual notes in unorganized thread
    
    // For now, return 0 since we don't have external content yet
    // In the future, this will count external content items
    console.log("Inbox count is 0 - reserved for external content only");
    return 0;
  } catch (error) {
    console.error("Error fetching inbox count:", error);
    return 0;
  }
}

// Get inbox display count (reserved for external content only)
export async function getInboxDisplayCount(userId: string) {
  try {
    // IMPORTANT: The inbox section is reserved for external content only
    // User-generated content should NEVER appear in the inbox
    
    // For now, return 0 since we don't have external content yet
    console.log("Inbox display count is 0 - reserved for external content only");
    return 0;
  } catch (error) {
    console.error("Error fetching inbox display count:", error);
    return 0;
  }
}

// Fetch featured content (reserved for external content only - no user-generated content)
export async function getFeaturedContent(userId: string) {
  console.log("getFeaturedContent called with userId:", userId);
  try {
    // IMPORTANT: The inbox section is reserved for external content only
    // User-generated notes and threads should NEVER appear in the inbox
    // This includes:
    // - Individual notes in unorganized thread
    // - Pinned threads
    // - Any other user-created content
    
    // For now, return empty array since we don't have external content yet
    // In the future, this will fetch content from:
    // - Harvous team recommendations
    // - Shared content from other users
    // - Curated Bible study materials
    // - Community highlights
    
    console.log("Inbox is empty - reserved for external content only");
    return [];
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
