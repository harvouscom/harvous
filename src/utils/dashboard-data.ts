import { db, Threads, Notes, Spaces, NoteThreads, eq, and, desc, count, or, ne, isNull, isNotNull } from "astro:db";
import { getThreadColorCSS, getThreadGradientCSS } from "./colors";
import { getInboxItems, getInboxCount as getInboxCountUtil } from "./inbox-data";

// Helper function to strip HTML tags and decode entities
function stripHtml(html: string): string {
  if (!html) return '';
  
  // More aggressive HTML stripping
  let text = html
    // Remove script and style tags completely (including their content)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove all HTML tags (including those with complex attributes)
    .replace(/<[^>]*>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x60;/g, '`')
    .replace(/&#x3D;/g, '=')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
    
  return text;
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

      return newUnorganizedThread;
    } catch (createError: any) {
      // If creation failed due to constraint, it means another process created it
      if (createError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || createError.rawCode === 1555) {
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


// Fetch all threads with note counts (excluding unorganized thread) - OPTIMIZED
export async function getAllThreadsWithCounts(userId: string) {
  try {
    // Get threads first
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

    // Get note counts for each thread using junction table only
    const threadsWithCounts = await Promise.all(
      threads.map(async (thread) => {
        const noteCountResult = await db.select({ count: count() })
          .from(Notes)
          .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
          .where(and(
            eq(NoteThreads.threadId, thread.id),
            eq(Notes.userId, userId)
          ))
          .get();

        return {
          ...thread,
          noteCount: noteCountResult?.count || 0
        };
      })
    );

    // Transform the results to match the expected format
    return threadsWithCounts.map(thread => ({
      id: thread.id,
      title: thread.title,
      subtitle: thread.subtitle,
      color: thread.color,
      spaceId: thread.spaceId,
      isPublic: thread.isPublic,
      isPinned: thread.isPinned,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      noteCount: thread.noteCount || 0,
      lastUpdated: thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color),
    }));
  } catch (error) {
    console.error("Error fetching threads:", error);
    // Return empty array if database fails - unorganized thread should not be displayed
    return [];
  }
}

// Fetch spaces with their content counts (only created spaces) - OPTIMIZED
export async function getSpacesWithCounts(userId: string) {
  try {
    // Get spaces with thread counts in a single query
    const spacesWithThreadCounts = await db.select({
      id: Spaces.id,
      title: Spaces.title,
      description: Spaces.description,
      color: Spaces.color,
      backgroundGradient: Spaces.backgroundGradient,
      isPublic: Spaces.isPublic,
      isActive: Spaces.isActive,
      createdAt: Spaces.createdAt,
      updatedAt: Spaces.updatedAt,
      threadCount: count(Threads.id),
    })
    .from(Spaces)
    .leftJoin(Threads, eq(Spaces.id, Threads.spaceId))
    .where(eq(Spaces.userId, userId))
    .groupBy(Spaces.id)
    .orderBy(desc(Spaces.isActive), desc(Spaces.updatedAt || Spaces.createdAt));

    // Get standalone note counts for each space in a single query
    const standaloneNoteCounts = await db.select({
      spaceId: Notes.spaceId,
      standaloneNoteCount: count(Notes.id),
    })
    .from(Notes)
    .where(and(
      eq(Notes.userId, userId),
      eq(Notes.threadId, "thread_unorganized"),
      isNotNull(Notes.spaceId)
    ))
    .groupBy(Notes.spaceId);

    // Get total note counts for each space in a single query
    const totalNoteCounts = await db.select({
      spaceId: Notes.spaceId,
      totalNoteCount: count(Notes.id),
    })
    .from(Notes)
    .where(and(
      eq(Notes.userId, userId),
      isNotNull(Notes.spaceId)
    ))
    .groupBy(Notes.spaceId);

    // Create lookup maps for efficient joining
    const standaloneCountMap = new Map(standaloneNoteCounts.map(item => [item.spaceId, item.standaloneNoteCount]));
    const totalCountMap = new Map(totalNoteCounts.map(item => [item.spaceId, item.totalNoteCount]));

    // Transform the results
    return spacesWithThreadCounts.map(space => ({
      id: space.id,
      title: space.title,
      description: space.description,
      color: space.color,
      backgroundGradient: space.backgroundGradient,
      isPublic: space.isPublic,
      isActive: space.isActive,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
      threadCount: space.threadCount || 0,
      standaloneNoteCount: standaloneCountMap.get(space.id) || 0,
      totalItemCount: (space.threadCount || 0) + (standaloneCountMap.get(space.id) || 0),
      totalNoteCount: totalCountMap.get(space.id) || 0,
      lastUpdated: space.updatedAt || space.createdAt,
    }));
  } catch (error) {
    console.error("Error fetching spaces:", error);
    return [];
  }
}

// Fetch threads for a specific space - OPTIMIZED
export async function getThreadsForSpace(spaceId: string, userId: string) {
  try {
    // Get threads first
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

    // Get note counts for each thread using junction table only
    const threadsWithCounts = await Promise.all(
      threads.map(async (thread) => {
        const noteCountResult = await db.select({ count: count() })
          .from(Notes)
          .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
          .where(and(
            eq(NoteThreads.threadId, thread.id),
            eq(Notes.userId, userId)
          ))
          .get();

        return {
          ...thread,
          noteCount: noteCountResult?.count || 0
        };
      })
    );

    // Transform the results to match the expected format
    return threadsWithCounts.map(thread => ({
      id: thread.id,
      title: thread.title,
      subtitle: thread.subtitle,
      color: thread.color,
      spaceId: thread.spaceId,
      isPublic: thread.isPublic,
      isPinned: thread.isPinned,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      noteCount: thread.noteCount || 0,
      lastUpdated: thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color),
    }));
  } catch (error) {
    console.error("Error fetching threads for space:", error);
    return [];
  }
}

// Fetch notes for a specific thread
export async function getNotesForThread(threadId: string, userId: string, limit = 20) {
  try {
    let allNotes = [];
    
    if (threadId === 'thread_unorganized') {
      // For unorganized thread, get notes that are ONLY in unorganized (no junction table entries)
      const unorganizedNotes = await db.select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        threadId: Notes.threadId,
        spaceId: Notes.spaceId,
        simpleNoteId: Notes.simpleNoteId,
        noteType: Notes.noteType,
        isPublic: Notes.isPublic,
        isFeatured: Notes.isFeatured,
        createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .where(and(eq(Notes.threadId, 'thread_unorganized'), eq(Notes.userId, userId)))
      .orderBy(desc(Notes.updatedAt || Notes.createdAt))
      .limit(limit);
      
      allNotes = unorganizedNotes;
    } else {
      // For regular threads, use junction table only
      const junctionNotes = await db.select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        threadId: Notes.threadId,
        spaceId: Notes.spaceId,
        simpleNoteId: Notes.simpleNoteId,
        noteType: Notes.noteType,
        isPublic: Notes.isPublic,
        isFeatured: Notes.isFeatured,
        createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId)))
      .orderBy(desc(Notes.updatedAt || Notes.createdAt))
      .limit(limit);
      
      allNotes = junctionNotes;
    }

    // Sort by updatedAt/createdAt and limit
    const sortedNotes = allNotes
      .sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt;
        const bTime = b.updatedAt || b.createdAt;
        return bTime.getTime() - aTime.getTime();
      })
      .slice(0, limit);
    
    return sortedNotes.map(note => ({
      ...note,
      lastUpdated: note.updatedAt || note.createdAt,
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
      noteType: Notes.noteType,
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
      lastUpdated: note.updatedAt || note.createdAt,
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
      noteType: Notes.noteType,
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
      lastUpdated: note.updatedAt || note.createdAt,
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
    
    // Use the inbox data utility to get actual count
    return await getInboxCountUtil(userId);
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
    return 0;
  } catch (error) {
    console.error("Error fetching inbox display count:", error);
    return 0;
  }
}

// Fetch featured content (reserved for external content only - no user-generated content)
export async function getFeaturedContent(userId: string) {
  try {
    // IMPORTANT: The inbox section is reserved for external content only
    // User-generated notes and threads should NEVER appear in the inbox
    // This includes:
    // - Individual notes in unorganized thread
    // - Pinned threads
    // - Any other user-created content
    
    // Fetch inbox items from Harvous team (synced from Webflow CMS)
    const inboxItems = await getInboxItems(userId);
    
    // Map inbox items to CardFeat format
    return inboxItems.map(item => {
      const cleanContent = stripHtml(item.content || '');
      return {
        id: item.id,
        type: item.contentType === 'thread' ? 'thread' : 'note',
        title: item.title,
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        imageUrl: item.imageUrl,
        variant: item.contentType === 'thread' ? 'Thread' : (item.imageUrl ? 'NoteImage' : 'Note'),
        lastUpdated: item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date(item.createdAt).toISOString(),
        isPrivate: true, // Inbox items are always private to the user
        threadId: item.contentType === 'thread' ? item.id : undefined,
        noteId: item.contentType === 'note' ? item.id : undefined,
        color: item.color,
        subtitle: item.subtitle,
      };
    });
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

    const assignedNoteItems = assignedNotes.map(note => {
      const cleanContent = stripHtml(note.content);
      return {
        id: `note-${note.id}`,
        type: "note" as const,
        title: note.title || "Untitled Note",
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        noteId: note.id, // Full ID including prefix
        threadId: note.threadId,
        spaceId: note.spaceId,
        noteType: note.noteType || 'default',
        lastUpdated: note.lastUpdated,
        updatedAt: note.updatedAt || note.createdAt, // Keep actual timestamp for sorting
      };
    });

    const unorganizedNoteItems = unorganizedNotes.map(note => {
      const cleanContent = stripHtml(note.content);
      return {
        id: `note-${note.id}`,
        type: "note" as const,
        title: note.title || "Untitled Note",
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        noteId: note.id, // Full ID including prefix
        threadId: note.threadId,
        spaceId: note.spaceId,
        noteType: note.noteType || 'default',
        lastUpdated: note.lastUpdated,
        updatedAt: note.updatedAt || note.createdAt, // Keep actual timestamp for sorting
      };
    });

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
      noteType: Notes.noteType,
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
      lastUpdated: note.updatedAt || note.createdAt,
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
        noteType: Notes.noteType,
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
        lastUpdated: note.updatedAt || note.createdAt,
      }));
    }

    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      noteType: Notes.noteType,
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
      lastUpdated: note.updatedAt || note.createdAt,
    }));
  } catch (error) {
    console.error("Error fetching assigned notes:", error);
    return [];
  }
}
