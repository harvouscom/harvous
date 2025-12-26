import { db, Threads, Notes, Spaces, NoteThreads, InboxItemNotes, ResourceMetadata, NoteScriptureReferences, ScriptureMetadata, eq, and, desc, count, or, ne, isNull, isNotNull, inArray } from "astro:db";
import { getThreadColorCSS, getThreadGradientCSS } from "./colors";
import { getInboxItems, getInboxCount as getInboxCountUtil } from "./inbox-data";
import { getRelativeTime } from "./date-formatting";

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
      if (createError.code === 'SQLITE_CONSTRAINT' || 
          createError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || 
          createError.rawCode === 1555 ||
          createError.message?.includes('UNIQUE constraint failed')) {
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
      lastVisited: Threads.lastVisited,
    })
    .from(Threads)
    .where(and(
      eq(Threads.userId, userId),
      ne(Threads.id, "thread_unorganized") // Exclude unorganized thread from dashboard display
    ))
    .orderBy(desc(Threads.isPinned), desc(Threads.updatedAt || Threads.createdAt))
    .all();

    // Get note counts for all threads in a single query using GROUP BY
    const threadIds = threads.map(thread => thread.id);
    let noteCountsMap = new Map<string, number>();
    
    if (threadIds.length > 0) {
      const noteCounts = await db.select({
        threadId: NoteThreads.threadId,
        count: count(),
      })
      .from(NoteThreads)
      .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
      .where(and(
        inArray(NoteThreads.threadId, threadIds),
        eq(Notes.userId, userId)
      ))
      .groupBy(NoteThreads.threadId)
      .all();
      
      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));
    }
    
    // Combine threads with their counts
    const threadsWithCounts = threads.map(thread => ({
      ...thread,
      noteCount: noteCountsMap.get(thread.id) || 0
    }));

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
      lastVisited: thread.lastVisited,
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
    .orderBy(desc(Spaces.isActive), desc(Spaces.updatedAt || Spaces.createdAt))
    .all();

    // Get standalone note counts for each space in a single query
    // Standalone notes are identified by having NO entries in NoteThreads junction table
    const standaloneNoteCounts = await db.select({
      spaceId: Notes.spaceId,
      standaloneNoteCount: count(Notes.id),
    })
    .from(Notes)
    .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
    .where(and(
      eq(Notes.userId, userId),
      isNull(NoteThreads.id), // No junction entry = unorganized/standalone
      isNotNull(Notes.spaceId)
    ))
    .groupBy(Notes.spaceId)
    .all();

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
    .groupBy(Notes.spaceId)
    .all();

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
      // totalItemCount = threads + all notes (including notes in threads)
      // This matches what's displayed in the space "All" tab
      totalItemCount: (space.threadCount || 0) + (totalCountMap.get(space.id) || 0),
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
      lastVisited: Threads.lastVisited,
    })
    .from(Threads)
    .where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, userId)))
    .orderBy(desc(Threads.isPinned), desc(Threads.lastVisited || Threads.createdAt))
    .all();

    // Get note counts for all threads in a single query using GROUP BY
    const threadIds = threads.map(thread => thread.id);
    let noteCountsMap = new Map<string, number>();
    
    if (threadIds.length > 0) {
      const noteCounts = await db.select({
        threadId: NoteThreads.threadId,
        count: count(),
      })
      .from(NoteThreads)
      .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
      .where(and(
        inArray(NoteThreads.threadId, threadIds),
        eq(Notes.userId, userId)
      ))
      .groupBy(NoteThreads.threadId)
      .all();
      
      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));
    }
    
    // Combine threads with their counts
    const threadsWithCounts = threads.map(thread => ({
      ...thread,
      noteCount: noteCountsMap.get(thread.id) || 0
    }));

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
      lastVisited: thread.lastVisited,
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
export async function getNotesForThread(threadId: string, userId: string, limit = 20, offset = 0) {
  try {
    // Fetch limit + offset + 1 items to check if there are more
    // The +1 allows us to determine if there are additional items beyond the requested range
    const fetchLimit = limit + offset + 1;
    let allNotes = [];
    
    if (threadId === 'thread_unorganized') {
      // For unorganized thread, get notes with NO junction table entries
      // Notes with any junction entry are in specific threads, not unorganized
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
        lastVisited: Notes.lastVisited,
      })
      .from(Notes)
      .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(
        eq(Notes.userId, userId),
        isNull(NoteThreads.id) // No junction entry = unorganized
      ))
      .orderBy(desc(Notes.lastVisited || Notes.createdAt))
      .limit(fetchLimit)
      .all();
      
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
        lastVisited: Notes.lastVisited,
      })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(eq(NoteThreads.threadId, threadId), eq(Notes.userId, userId)))
      .orderBy(desc(Notes.lastVisited || Notes.createdAt))
      .limit(fetchLimit)
      .all();
      
      allNotes = junctionNotes;
    }

    // Sort by lastVisited/createdAt, apply offset and limit
    // Note: Database already orders by lastVisited/createdAt, but we sort again
    // to ensure consistent ordering in case of ties
    const sortedAllNotes = allNotes
      .sort((a, b) => {
        const aTime = a.lastVisited || a.createdAt;
        const bTime = b.lastVisited || b.createdAt;
        return bTime.getTime() - aTime.getTime();
      });
    
    // Determine if there are more items beyond the requested range
    // We fetched limit + offset + 1 items, so if we have more than offset + limit items, there are more
    const hasMore = sortedAllNotes.length > offset + limit;
    
    // Slice to get exactly 'limit' items starting from 'offset'
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);
    
    // Fetch ResourceMetadata for resource notes
    const resourceNoteIds = sortedNotes
      .filter(note => note.noteType === 'resource')
      .map(note => note.id);
    
    let resourceMetadataMap: Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null; sourceDomain: string | null; sourceName: string | null }> = {};
    
    if (resourceNoteIds.length > 0) {
      try {
        const resourceMetadata = await db.select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName,
        })
        .from(ResourceMetadata)
        .where(inArray(ResourceMetadata.noteId, resourceNoteIds))
        .all();
        
        resourceMetadataMap = resourceMetadata.reduce((acc, meta) => {
          acc[meta.noteId] = {
            sourceTitle: meta.sourceTitle,
            sourceDescription: meta.sourceDescription,
            sourceImage: meta.sourceImage,
            sourceDomain: meta.sourceDomain,
            sourceName: meta.sourceName,
          };
          return acc;
        }, {} as Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null; sourceDomain: string | null; sourceName: string | null }>);
      } catch (error) {
        console.error("Error fetching resource metadata:", error);
      }
    }
    
    // Fetch thread colors for all notes (fetch all threads each note belongs to, not just current thread)
    const notesWithThreadColors = await Promise.all(
      sortedNotes.map(async (note) => {
        const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
        const threadColors = await getThreadColorsForNote(note.id, userId);
        return {
          ...note,
          lastUpdated: note.updatedAt || note.createdAt,
          lastVisited: note.lastVisited,
          resourceTitle: resourceMeta?.sourceTitle || null,
          resourceDescription: resourceMeta?.sourceDescription || null,
          resourceImage: resourceMeta?.sourceImage || null,
          threadColors: threadColors.length > 0 ? threadColors : undefined,
        };
      })
    );

    return { notes: notesWithThreadColors, hasMore };
  } catch (error) {
    console.error("Error fetching notes for thread:", error);
    return [];
  }
}

// Get total note counts by type for a thread
export async function getThreadNoteTypeCounts(threadId: string, userId: string) {
  try {
    let allCount = 0;
    let defaultCount = 0;
    let scriptureCount = 0;
    let resourceCount = 0;

    if (threadId === 'thread_unorganized') {
      // For unorganized thread, count notes with NO junction table entries
      const allNotes = await db.select({
        noteType: Notes.noteType,
      })
      .from(Notes)
      .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(
        eq(Notes.userId, userId),
        isNull(NoteThreads.id) // No junction entry = unorganized
      ))
      .all();

      allCount = allNotes.length;
      defaultCount = allNotes.filter(n => !n.noteType || n.noteType === 'default').length;
      scriptureCount = allNotes.filter(n => n.noteType === 'scripture').length;
      resourceCount = allNotes.filter(n => n.noteType === 'resource').length;
    } else {
      // For regular threads, use junction table
      const allNotes = await db.select({
        noteType: Notes.noteType,
      })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(
        eq(NoteThreads.threadId, threadId),
        eq(Notes.userId, userId)
      ))
      .all();

      allCount = allNotes.length;
      defaultCount = allNotes.filter(n => !n.noteType || n.noteType === 'default').length;
      scriptureCount = allNotes.filter(n => n.noteType === 'scripture').length;
      resourceCount = allNotes.filter(n => n.noteType === 'resource').length;
    }

    return {
      all: allCount,
      default: defaultCount,
      scripture: scriptureCount,
      resource: resourceCount
    };
  } catch (error) {
    console.error("Error fetching note type counts for thread:", error);
    return {
      all: 0,
      default: 0,
      scripture: 0,
      resource: 0
    };
  }
}

// Fetch notes for a specific space (both in threads and standalone)
export async function getNotesForSpace(spaceId: string, userId: string, limit = 20, offset = 0) {
  try {
    // Fetch limit + offset + 1 items to check if there are more
    // The +1 allows us to determine if there are additional items beyond the requested range
    const fetchLimit = limit + offset + 1;
    
    // Fetch all notes in the space (including notes that are in threads)
    // Notes can be in threads but still shown separately in the space view
    const allNotes = await db.select({
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
      lastVisited: Notes.lastVisited,
    })
    .from(Notes)
    .where(and(eq(Notes.spaceId, spaceId), eq(Notes.userId, userId)))
    .orderBy(desc(Notes.lastVisited || Notes.createdAt))
    .limit(fetchLimit)
    .all();

    // Sort by lastVisited/createdAt, apply offset and limit
    // Note: Database already orders by lastVisited/createdAt, but we sort again
    // to ensure consistent ordering in case of ties
    const sortedAllNotes = allNotes
      .sort((a, b) => {
        const aTime = a.lastVisited || a.createdAt;
        const bTime = b.lastVisited || b.createdAt;
        return bTime.getTime() - aTime.getTime();
      });
    
    // Determine if there are more items beyond the requested range
    // We fetched limit + offset + 1 items, so if we have more than offset + limit items, there are more
    const hasMore = sortedAllNotes.length > offset + limit;
    
    // Slice to get exactly 'limit' items starting from 'offset'
    const sortedNotes = sortedAllNotes.slice(offset, offset + limit);

    // Fetch ResourceMetadata for resource notes
    const resourceNoteIds = sortedNotes
      .filter(note => note.noteType === 'resource')
      .map(note => note.id);
    
    let resourceMetadataMap: Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null; sourceDomain: string | null; sourceName: string | null }> = {};
    
    if (resourceNoteIds.length > 0) {
      try {
        const resourceMetadata = await db.select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName,
        })
        .from(ResourceMetadata)
        .where(inArray(ResourceMetadata.noteId, resourceNoteIds))
        .all();
        
        resourceMetadataMap = resourceMetadata.reduce((acc, meta) => {
          acc[meta.noteId] = {
            sourceTitle: meta.sourceTitle,
            sourceDescription: meta.sourceDescription,
            sourceImage: meta.sourceImage,
            sourceDomain: meta.sourceDomain,
            sourceName: meta.sourceName,
          };
          return acc;
        }, {} as Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null; sourceDomain: string | null; sourceName: string | null }>);
      } catch (error) {
        console.error("Error fetching resource metadata:", error);
      }
    }

    // Fetch thread colors for all notes
    const notesWithThreadColors = await Promise.all(
      sortedNotes.map(async (note) => {
        const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
        const threadColors = await getThreadColorsForNote(note.id, userId);
        return {
          ...note,
          lastUpdated: note.updatedAt || note.createdAt,
          lastVisited: note.lastVisited,
          resourceTitle: resourceMeta?.sourceTitle || null,
          resourceDescription: resourceMeta?.sourceDescription || null,
          resourceImage: resourceMeta?.sourceImage || null,
          threadColors: threadColors.length > 0 ? threadColors : undefined,
        };
      })
    );

    return { notes: notesWithThreadColors, hasMore };
  } catch (error) {
    console.error("Error fetching notes for space:", error);
    return { notes: [], hasMore: false };
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
    .limit(limit)
    .all();

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
    
    // Use the inbox data utility to get actual count
    return await getInboxCountUtil(userId);
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
    
    // Filter to only show threads - notes should not appear in inbox
    const threadItems = inboxItems.filter(item => item.contentType === 'thread');
    
    // Map inbox items to CardFeat format with note counts for threads
    return await Promise.all(threadItems.map(async (item) => {
      const cleanContent = stripHtml(item.content || '');
      
      // Get note count for threads
      let noteCount = 0;
      if (item.contentType === 'thread') {
        const countResult = await db
          .select({ count: count() })
          .from(InboxItemNotes)
          .where(eq(InboxItemNotes.inboxItemId, item.id))
          .get();
        noteCount = countResult?.count || 0;
      }
      
      // Format timestamp showing when item was made available to user
      // item.createdAt comes from UserInboxItems.createdAt (when item appeared in user's inbox)
      let displayTimestamp: string | undefined = undefined;
      if (item.createdAt) {
        try {
          displayTimestamp = getRelativeTime(new Date(item.createdAt));
        } catch (error) {
          console.error('Error formatting timestamp:', error, 'item.createdAt:', item.createdAt);
          displayTimestamp = undefined;
        }
      } else {
        // Debug: log if createdAt is missing
        console.warn('Inbox item missing createdAt timestamp:', item.id, item.title);
      }
      
      return {
        id: item.id,
        type: item.contentType === 'thread' ? 'thread' : 'note',
        title: item.title,
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        imageUrl: item.imageUrl,
        variant: item.contentType === 'thread' ? 'Thread' : (item.imageUrl ? 'NoteImage' : 'Note'),
        lastUpdated: displayTimestamp, // Relative time when item was made available to user (undefined if not available)
        isPrivate: true, // Inbox items are always private to the user
        threadId: item.contentType === 'thread' ? item.id : undefined,
        noteId: item.contentType === 'note' ? item.id : undefined,
        color: item.color,
        subtitle: item.subtitle,
        count: noteCount, // Note count for threads
        threadType: item.threadType, // Thread type from CMS
      };
    }));
  } catch (error) {
    console.error("Error fetching featured content:", error);
    return [];
  }
}

// Get content items for the main list (organized content + unorganized notes)
// filterExcludeReferencedScripture: if true, exclude scripture notes that are referenced by other notes (only for 'all' tab)
export async function getContentItems(userId: string, limit = 20, offset = 0, filterExcludeReferencedScripture = false) {
  try {
    // Fetch enough items to cover offset + limit
    const fetchLimit = limit + offset;
    const [threads, assignedNotesRaw, unorganizedNotesRaw] = await Promise.all([
      getAllThreadsWithCounts(userId),
      getAssignedNotesForDashboard(userId, fetchLimit),
      getUnorganizedNotesForDashboard(userId, fetchLimit)
    ]);
    
    // Use let so we can filter out referenced scripture notes later
    let assignedNotes = assignedNotesRaw;
    let unorganizedNotes = unorganizedNotesRaw;

    console.log('[getContentItems] Initial fetch', {
      filterExcludeReferencedScripture,
      assignedNotesCount: assignedNotes.length,
      assignedScriptureCount: assignedNotes.filter(n => n.noteType === 'scripture').length,
      unorganizedNotesCount: unorganizedNotes.length,
      unorganizedScriptureCount: unorganizedNotes.filter(n => n.noteType === 'scripture').length,
      limit,
      offset
    });

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
      lastVisited: thread.lastVisited,
      createdAt: thread.createdAt,
      isPrivate: !thread.isPublic,
      accentColor: thread.accentColor,
    }));

    // Fetch resource metadata for all resource notes
    const allNoteIds = [...assignedNotes, ...unorganizedNotes].map(n => n.id);
    const resourceNoteIds = [...assignedNotes, ...unorganizedNotes]
      .filter(note => note.noteType === 'resource')
      .map(note => note.id);
    
    let resourceMetadataMap: Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null; sourceDomain: string | null; sourceName: string | null }> = {};
    
    if (resourceNoteIds.length > 0) {
      try {
        const resourceMetadata = await db.select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage,
          sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName,
        })
        .from(ResourceMetadata)
        .where(inArray(ResourceMetadata.noteId, resourceNoteIds))
        .all();
        
        resourceMetadataMap = resourceMetadata.reduce((acc, meta) => {
          acc[meta.noteId] = {
            sourceTitle: meta.sourceTitle,
            sourceDescription: meta.sourceDescription,
            sourceImage: meta.sourceImage,
            sourceDomain: meta.sourceDomain,
            sourceName: meta.sourceName,
          };
          return acc;
        }, {} as Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null; sourceDomain: string | null; sourceName: string | null }>);
      } catch (error) {
        // Resource metadata fetch failed - continue without it
      }
    }

    // Fetch scripture references for all default notes (via junction table)
    // Only fetch if we need to exclude referenced scripture notes OR if we need to show references in collapsible
    let scriptureReferencesMap: Record<string, Array<{ reference: string; noteId: string; threadColors?: Array<{ color: string; frequency: number }> }>> = {};
    const defaultNoteIds = [...assignedNotes, ...unorganizedNotes]
      .filter(note => note.noteType === 'default' || !note.noteType)
      .map(note => note.id);
    
    if (defaultNoteIds.length > 0) {
      try {
        // Get scripture note IDs for each note via junction table
        const junctionEntries = await db.select({
          noteId: NoteScriptureReferences.noteId,
          scriptureNoteId: NoteScriptureReferences.scriptureNoteId,
        })
        .from(NoteScriptureReferences)
        .where(inArray(NoteScriptureReferences.noteId, defaultNoteIds))
        .all();
        
        console.log('[getContentItems] Scripture references fetch', {
          defaultNoteIdsCount: defaultNoteIds.length,
          junctionEntriesCount: junctionEntries.length
        });
        
        // Get unique scripture note IDs
        const scriptureNoteIds = [...new Set(junctionEntries.map(e => e.scriptureNoteId))];
        
        // Fetch scripture metadata to get reference text
        let scriptureMetadataMap: Record<string, string> = {};
        if (scriptureNoteIds.length > 0) {
          const scriptureMetadata = await db.select({
            noteId: ScriptureMetadata.noteId,
            reference: ScriptureMetadata.reference,
          })
          .from(ScriptureMetadata)
          .where(inArray(ScriptureMetadata.noteId, scriptureNoteIds))
          .all();
          
          scriptureMetadataMap = scriptureMetadata.reduce((acc, meta) => {
            acc[meta.noteId] = meta.reference;
            return acc;
          }, {} as Record<string, string>);
        }
        
        // Fetch thread colors for all scripture notes
        const scriptureNoteIdsArray = Array.from(scriptureNoteIds);
        const scriptureThreadColorsMap: Record<string, Array<{ color: string; frequency: number }>> = {};
        
        if (scriptureNoteIdsArray.length > 0) {
          await Promise.all(
            scriptureNoteIdsArray.map(async (scriptureNoteId) => {
              const threadColors = await getThreadColorsForNote(scriptureNoteId, userId);
              if (threadColors.length > 0) {
                scriptureThreadColorsMap[scriptureNoteId] = threadColors;
              }
            })
          );
        }
        
        // Build map of noteId -> array of scripture references with note IDs and thread colors (needed for collapsible UI)
        for (const entry of junctionEntries) {
          const reference = scriptureMetadataMap[entry.scriptureNoteId];
          if (reference) {
            if (!scriptureReferencesMap[entry.noteId]) {
              scriptureReferencesMap[entry.noteId] = [];
            }
            // Store as object with reference, noteId, and threadColors for mesh gradient
            scriptureReferencesMap[entry.noteId].push({
              reference,
              noteId: entry.scriptureNoteId,
              threadColors: scriptureThreadColorsMap[entry.scriptureNoteId] || undefined
            });
          }
        }
        
        console.log('[getContentItems] Scripture references map built', {
          notesWithReferences: Object.keys(scriptureReferencesMap).length,
          totalReferences: Object.values(scriptureReferencesMap).reduce((sum, refs) => sum + refs.length, 0)
        });
        
        // Only filter out referenced scripture notes if filterExcludeReferencedScripture is true
        // This should only happen in the 'all' tab, not in the 'scripture' tab
        if (filterExcludeReferencedScripture) {
          // Get set of scripture note IDs that are referenced by other notes (should be excluded from list)
          const referencedScriptureNoteIds = new Set(junctionEntries.map(e => e.scriptureNoteId));
          
          console.log('[getContentItems] Filtering out referenced scripture notes', {
            referencedScriptureNoteIdsCount: referencedScriptureNoteIds.size,
            assignedNotesBefore: assignedNotes.filter(n => n.noteType === 'scripture').length,
            unorganizedNotesBefore: unorganizedNotes.filter(n => n.noteType === 'scripture').length
          });
          
          // Filter out scripture notes that are referenced by other notes
          assignedNotes = assignedNotes.filter(note => 
            note.noteType !== 'scripture' || !referencedScriptureNoteIds.has(note.id)
          );
          unorganizedNotes = unorganizedNotes.filter(note => 
            note.noteType !== 'scripture' || !referencedScriptureNoteIds.has(note.id)
          );
        }
      } catch (error) {
        // Scripture references fetch failed - continue without it
        console.error('Error fetching scripture references:', error);
      }
    }

    const assignedNoteItems = assignedNotes.map(note => {
      const cleanContent = stripHtml(note.content);
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      return {
        id: `note-${note.id}`,
        type: "note" as const,
        title: resourceMeta?.sourceTitle || note.title || "Untitled Note",
        content: (resourceMeta?.sourceDescription || cleanContent).substring(0, 150) + ((resourceMeta?.sourceDescription || cleanContent).length > 150 ? "..." : ""),
        noteId: note.id, // Full ID including prefix
        threadId: note.threadId,
        spaceId: note.spaceId,
        noteType: note.noteType || 'default',
        lastUpdated: note.lastUpdated,
        updatedAt: note.updatedAt || note.createdAt, // Keep actual timestamp for sorting
        lastVisited: note.lastVisited,
        createdAt: note.createdAt,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: (note as any).threadColors,
        scriptureReferences: scriptureReferencesMap[note.id] || undefined,
      };
    });

    const unorganizedNoteItems = unorganizedNotes.map(note => {
      const cleanContent = stripHtml(note.content);
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      return {
        id: `note-${note.id}`,
        type: "note" as const,
        title: resourceMeta?.sourceTitle || note.title || "Untitled Note",
        content: (resourceMeta?.sourceDescription || cleanContent).substring(0, 150) + ((resourceMeta?.sourceDescription || cleanContent).length > 150 ? "..." : ""),
        noteId: note.id, // Full ID including prefix
        threadId: note.threadId,
        spaceId: note.spaceId,
        noteType: note.noteType || 'default',
        lastUpdated: note.lastUpdated,
        updatedAt: note.updatedAt || note.createdAt, // Keep actual timestamp for sorting
        lastVisited: note.lastVisited,
        createdAt: note.createdAt,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: (note as any).threadColors,
        scriptureReferences: scriptureReferencesMap[note.id] || undefined,
      };
    });

    // Combine and deduplicate by note ID, then sort by actual timestamp (newest first)
    // This ensures each note appears only once, regardless of which query it came from
    const allItemsMap = new Map<string, any>();

    // Add thread items (no deduplication needed for threads, but use Map for consistency)
    threadItems.forEach(item => {
      allItemsMap.set(item.id, item);
    });

    // Add assigned notes, checking for duplicates
    assignedNoteItems.forEach(item => {
      if (!allItemsMap.has(item.id)) {
        allItemsMap.set(item.id, item);
      }
    });

    // Add unorganized notes, checking for duplicates
    unorganizedNoteItems.forEach(item => {
      if (!allItemsMap.has(item.id)) {
        allItemsMap.set(item.id, item);
      }
    });

    // Convert map to array and sort by lastVisited (newest first)
    // Apply offset and limit after sorting
    const allItems = Array.from(allItemsMap.values())
      .sort((a, b) => {
        // Handle null/undefined lastVisited by falling back to createdAt
        const aTime = a.lastVisited 
          ? new Date(a.lastVisited).getTime() 
          : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const bTime = b.lastVisited 
          ? new Date(b.lastVisited).getTime() 
          : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return bTime - aTime; // Newest first
      })
      .slice(offset, offset + limit);

    const scriptureItemsCount = allItems.filter(item => item.type === 'note' && item.noteType === 'scripture').length;
    console.log('[getContentItems] Final result', {
      totalItems: allItems.length,
      scriptureItemsCount,
      filterExcludeReferencedScripture
    });

    return allItems;
  } catch (error) {
    console.error("Error fetching content items:", error);
    return [];
  }
}

// Fetch unorganized notes for dashboard (notes in unorganized thread)
// Helper function to fetch thread colors with frequency for a note
async function getThreadColorsForNote(noteId: string, userId: string): Promise<Array<{ color: string; frequency: number }>> {
  try {
    // Fetch all threads this note belongs to via junction table
    const noteThreads = await db.select({
      threadId: NoteThreads.threadId,
      color: Threads.color,
    })
    .from(NoteThreads)
    .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
    .where(and(
      eq(NoteThreads.noteId, noteId),
      eq(Threads.userId, userId),
      ne(Threads.id, "thread_unorganized") // Exclude unorganized thread
    ))
    .all();

    // Group by color and count frequency
    const colorFrequencyMap = new Map<string, number>();
    for (const nt of noteThreads) {
      if (nt.color) {
        const currentCount = colorFrequencyMap.get(nt.color) || 0;
        colorFrequencyMap.set(nt.color, currentCount + 1);
      }
    }

    // Convert to array format
    return Array.from(colorFrequencyMap.entries()).map(([color, frequency]) => ({
      color,
      frequency,
    }));
  } catch (error) {
    console.error(`Error fetching thread colors for note ${noteId}:`, error);
    return [];
  }
}

export async function getUnorganizedNotesForDashboard(userId: string, limit = 10) {
  try {
    // For unorganized notes, get notes with NO junction table entries
    // Notes with any junction entry are in specific threads, not unorganized
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
      lastVisited: Notes.lastVisited,
    })
    .from(Notes)
    .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
    .where(and(
      eq(Notes.userId, userId),
      isNull(NoteThreads.id) // No junction entry = unorganized
    ))
    .orderBy(desc(Notes.updatedAt || Notes.createdAt))
    .limit(limit)
    .all();

    // Fetch thread colors for all notes
    const notesWithThreadColors = await Promise.all(
      notes.map(async (note) => {
        const threadColors = await getThreadColorsForNote(note.id, userId);
        return {
          ...note,
          lastUpdated: note.updatedAt || note.createdAt,
          threadColors: threadColors.length > 0 ? threadColors : undefined,
        };
      })
    );

    const scriptureCount = notesWithThreadColors.filter(n => n.noteType === 'scripture').length;
    console.log('[getUnorganizedNotesForDashboard] Total notes:', notesWithThreadColors.length, 'Scripture notes:', scriptureCount);

    return notesWithThreadColors;
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
        lastVisited: Notes.lastVisited,
      })
      .from(Notes)
      .where(eq(Notes.userId, userId))
      .orderBy(desc(Notes.updatedAt || Notes.createdAt))
      .limit(limit)
      .all();

      // Fetch thread colors for all notes
      const notesWithThreadColors = await Promise.all(
        notes.map(async (note) => {
          const threadColors = await getThreadColorsForNote(note.id, userId);
          return {
            ...note,
            lastUpdated: note.updatedAt || note.createdAt,
            threadColors: threadColors.length > 0 ? threadColors : undefined,
          };
        })
      );

      const scriptureCount = notesWithThreadColors.filter(n => n.noteType === 'scripture').length;
      console.log('[getAssignedNotesForDashboard] No unorganized thread - Total notes:', notesWithThreadColors.length, 'Scripture notes:', scriptureCount);

      return notesWithThreadColors;
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
      lastVisited: Notes.lastVisited,
    })
    .from(Notes)
    .where(and(
      eq(Notes.userId, userId),
      ne(Notes.threadId, unorganizedThread.id)
    ))
    .orderBy(desc(Notes.updatedAt || Notes.createdAt))
    .limit(limit)
    .all();

    // Fetch thread colors for all notes
    const notesWithThreadColors = await Promise.all(
      notes.map(async (note) => {
        const threadColors = await getThreadColorsForNote(note.id, userId);
        return {
          ...note,
          lastUpdated: note.updatedAt || note.createdAt,
          threadColors: threadColors.length > 0 ? threadColors : undefined,
        };
      })
    );

    const scriptureCount = notesWithThreadColors.filter(n => n.noteType === 'scripture').length;
    console.log('[getAssignedNotesForDashboard] With unorganized thread - Total notes:', notesWithThreadColors.length, 'Scripture notes:', scriptureCount);

    return notesWithThreadColors;
  } catch (error) {
    console.error("Error fetching assigned notes:", error);
    return [];
  }
}

// Optimized function to fetch scripture notes directly from database
// This avoids fetching all notes and filtering in memory
export async function getScriptureNotesForDashboard(userId: string, limit = 20, offset = 0): Promise<{ items: any[]; hasMore: boolean }> {
  try {
    // Query scripture notes directly with proper pagination
    // Fetch limit + 1 to check if there are more items
    const fetchLimit = limit + 1;
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
      lastVisited: Notes.lastVisited,
    })
    .from(Notes)
    .where(and(
      eq(Notes.userId, userId),
      eq(Notes.noteType, 'scripture')
    ))
    .orderBy(desc(Notes.lastVisited), desc(Notes.createdAt))
    .limit(fetchLimit)
    .offset(offset)
    .all();

    // Sort in JavaScript to ensure correct ordering (lastVisited with fallback to createdAt)
    // This handles null lastVisited values correctly
    const sortedNotes = notes.sort((a, b) => {
      const aTime = a.lastVisited || a.createdAt;
      const bTime = b.lastVisited || b.createdAt;
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1; // null lastVisited goes after
      if (!bTime) return -1; // null lastVisited goes after
      return bTime.getTime() - aTime.getTime(); // Newest first
    });

    // Apply limit after sorting
    const limitedNotes = sortedNotes.slice(0, limit);

    // Batch fetch thread colors for all notes in parallel
    // This is much more efficient than calling getThreadColorsForNote for each note
    const noteIds = limitedNotes.map(note => note.id);
    let threadColorsMap: Record<string, Array<{ color: string; frequency: number }>> = {};

    if (noteIds.length > 0) {
      try {
        // Fetch all thread associations for all notes at once
        const allNoteThreads = await db.select({
          noteId: NoteThreads.noteId,
          threadId: NoteThreads.threadId,
          color: Threads.color,
        })
        .from(NoteThreads)
        .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
        .where(and(
          inArray(NoteThreads.noteId, noteIds),
          eq(Threads.userId, userId),
          ne(Threads.id, "thread_unorganized") // Exclude unorganized thread
        ))
        .all();

        // Group by noteId and then by color to count frequency
        const noteColorMap = new Map<string, Map<string, number>>();
        
        for (const nt of allNoteThreads) {
          if (nt.color) {
            if (!noteColorMap.has(nt.noteId)) {
              noteColorMap.set(nt.noteId, new Map());
            }
            const colorMap = noteColorMap.get(nt.noteId)!;
            const currentCount = colorMap.get(nt.color) || 0;
            colorMap.set(nt.color, currentCount + 1);
          }
        }

        // Convert to the expected format
        for (const [noteId, colorMap] of noteColorMap.entries()) {
          threadColorsMap[noteId] = Array.from(colorMap.entries()).map(([color, frequency]) => ({
            color,
            frequency,
          }));
        }
      } catch (error) {
        console.error('Error batch fetching thread colors for scripture notes:', error);
        // Continue without thread colors if this fails
      }
    }

    // Format notes to match OrganizedContentItem interface
    const noteItems = limitedNotes.map(note => {
      const cleanContent = stripHtml(note.content);
      return {
        id: `note-${note.id}`,
        type: "note" as const,
        title: note.title || "Untitled Note",
        content: cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : ""),
        noteId: note.id,
        threadId: note.threadId,
        spaceId: note.spaceId,
        noteType: note.noteType || 'scripture',
        lastUpdated: note.updatedAt || note.createdAt,
        updatedAt: note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        createdAt: note.createdAt,
        threadColors: threadColorsMap[note.id] || undefined,
      };
    });

    const hasMore = sortedNotes.length > limit;

    console.log('[getScriptureNotesForDashboard] Fetched scripture notes', {
      count: noteItems.length,
      fetched: sortedNotes.length,
      limit,
      offset,
      hasMore
    });

    return { items: noteItems, hasMore };
  } catch (error) {
    console.error("Error fetching scripture notes:", error);
    return { items: [], hasMore: false };
  }
}
