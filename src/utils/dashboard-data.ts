import { db, Threads, Notes, Spaces, NoteThreads, InboxItemNotes, ResourceMetadata, NoteScriptureReferences, ScriptureMetadata, eq, and, desc, count, or, ne, isNull, isNotNull, inArray } from "astro:db";
import { getThreadColorCSS, getThreadGradientCSS } from "./colors";
import { getInboxItems, getInboxCount as getInboxCountUtil } from "./inbox-data";
import { getRelativeTime } from "./date-formatting";
import { stripHtml } from "./html-stripper";
import { sortByLastVisited } from "./sorting";

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

// Fetch a single thread by ID with note count (optimized for thread page loads)
// This is much faster than getAllThreadsWithCounts when you only need one thread
export async function getThreadWithCount(threadId: string, userId: string) {
  try {
    // Get the thread
    const thread = await db.select({
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
      eq(Threads.id, threadId),
      eq(Threads.userId, userId)
    ))
    .get();

    if (!thread) {
      return null;
    }

    // Get note count for this thread
    const noteCountResult = await db.select({
      count: count(),
    })
    .from(NoteThreads)
    .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
    .where(and(
      eq(NoteThreads.threadId, threadId),
      eq(Notes.userId, userId)
    ))
    .get();

    const noteCount = noteCountResult?.count || 0;

    return {
      ...thread,
      noteCount,
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
      accentColor: getThreadColorCSS(thread.color),
      backgroundGradient: getThreadGradientCSS(thread.color),
    };
  } catch (error) {
    console.error("Error fetching thread with count:", error);
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
    .orderBy(desc(Threads.isPinned), desc(Threads.lastVisited), desc(Threads.updatedAt), desc(Threads.createdAt), Threads.id)
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
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
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
    .orderBy(desc(Threads.isPinned), desc(Threads.lastVisited), desc(Threads.updatedAt), desc(Threads.createdAt))
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
      lastUpdated: thread.lastVisited || thread.updatedAt || thread.createdAt,
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
      .orderBy(desc(Notes.lastVisited), desc(Notes.createdAt), Notes.id)
      .limit(fetchLimit)
      .all();
      
      // Also fetch scripture notes referenced by unorganized notes
      const unorganizedNoteIds = unorganizedNotes.map(n => n.id).filter(id => id);
      let referencedScriptureNotes: typeof unorganizedNotes = [];
      
      if (unorganizedNoteIds.length > 0) {
        // Find scripture notes referenced by unorganized notes
        const referencedScriptureNoteIds = await db
          .select({ 
            scriptureNoteId: NoteScriptureReferences.scriptureNoteId
          })
          .from(NoteScriptureReferences)
          .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(
            inArray(NoteScriptureReferences.noteId, unorganizedNoteIds),
            eq(Notes.userId, userId),
            eq(Notes.noteType, 'scripture')
          ))
          .all();

        // Get unique scripture note IDs (deduplicate)
        const uniqueReferencedScriptureIds = Array.from(
          new Set(referencedScriptureNoteIds.map(r => r.scriptureNoteId))
        );

        // Check which referenced scripture notes are NOT already in unorganized
        const alreadyInUnorganizedIds = new Set(
          unorganizedNotes.filter(n => n.noteType === 'scripture').map(n => n.id)
        );

        const additionalScriptureNoteIds = uniqueReferencedScriptureIds.filter(
          id => !alreadyInUnorganizedIds.has(id)
        );

        // Fetch the full note data for referenced scripture notes
        if (additionalScriptureNoteIds.length > 0) {
          referencedScriptureNotes = await db.select({
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
            inArray(Notes.id, additionalScriptureNoteIds),
            eq(Notes.userId, userId),
            eq(Notes.noteType, 'scripture')
          ))
          .all();
        }
      }
      
      // Combine unorganized notes with referenced scripture notes
      // Deduplicate by note ID (in case a scripture note is both directly in unorganized and referenced)
      const notesMap = new Map<string, typeof unorganizedNotes[0]>();
      [...unorganizedNotes, ...referencedScriptureNotes].forEach(note => {
        if (note.id && !notesMap.has(note.id)) {
          notesMap.set(note.id, note);
        }
      });
      allNotes = Array.from(notesMap.values());
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
      .orderBy(desc(Notes.lastVisited), desc(Notes.createdAt), Notes.id)
      .limit(fetchLimit)
      .all();
      
      // Also fetch scripture notes referenced by notes in this thread
      const threadNoteIds = junctionNotes.map(n => n.id).filter(id => id);
      let referencedScriptureNotes: typeof junctionNotes = [];
      
      if (threadNoteIds.length > 0) {
        // Find scripture notes referenced by notes in this thread
        const referencedScriptureNoteIds = await db
          .select({ 
            scriptureNoteId: NoteScriptureReferences.scriptureNoteId
          })
          .from(NoteScriptureReferences)
          .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(
            inArray(NoteScriptureReferences.noteId, threadNoteIds),
            eq(Notes.userId, userId),
            eq(Notes.noteType, 'scripture')
          ))
          .all();

        // Get unique scripture note IDs (deduplicate)
        const uniqueReferencedScriptureIds = Array.from(
          new Set(referencedScriptureNoteIds.map(r => r.scriptureNoteId))
        );

        // Check which referenced scripture notes are NOT already directly in the thread
        const alreadyInThreadIds = new Set(
          junctionNotes.filter(n => n.noteType === 'scripture').map(n => n.id)
        );

        const additionalScriptureNoteIds = uniqueReferencedScriptureIds.filter(
          id => !alreadyInThreadIds.has(id)
        );

        // Fetch the full note data for referenced scripture notes
        if (additionalScriptureNoteIds.length > 0) {
          referencedScriptureNotes = await db.select({
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
            inArray(Notes.id, additionalScriptureNoteIds),
            eq(Notes.userId, userId),
            eq(Notes.noteType, 'scripture')
          ))
          .all();
        }
      }
      
      // Combine junction notes with referenced scripture notes
      // Deduplicate by note ID (in case a scripture note is both directly in thread and referenced)
      const notesMap = new Map<string, typeof junctionNotes[0]>();
      [...junctionNotes, ...referencedScriptureNotes].forEach(note => {
        if (note.id && !notesMap.has(note.id)) {
          notesMap.set(note.id, note);
        }
      });
      allNotes = Array.from(notesMap.values());
    }

    // Sort by lastVisited/createdAt, apply offset and limit
    // Note: Database already orders by lastVisited/createdAt, but we sort again
    // to ensure consistent ordering in case of ties
    // For onboarding thread, use chronological sorting by createdAt (oldest first)
    const isOnboardingThread = threadId.startsWith('thread_onboarding_');
    const sortedAllNotes = isOnboardingThread
      ? allNotes.map(note => ({
          ...note,
          updatedAt: note.updatedAt || note.createdAt,
          id: note.id || ''
        })).sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (aTime !== bTime) return aTime - bTime; // Ascending order (oldest first)
          // ID tiebreaker for deterministic sorting
          if (a.id < b.id) return -1;
          if (a.id > b.id) return 1;
          return 0;
        })
      : sortByLastVisited(allNotes.map(note => ({
          ...note,
          updatedAt: note.updatedAt || note.createdAt,
          id: note.id || ''
        })));
    
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
    
    // Fetch thread colors for all notes in batch (optimized - single query instead of N queries)
    const noteIds = sortedNotes.map(note => note.id).filter((id): id is string => !!id);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
    
    const notesWithThreadColors = sortedNotes.map((note) => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
      };
    });

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
        id: Notes.id,
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

      // Also count scripture notes referenced by unorganized notes
      // Get unorganized note IDs
      const unorganizedNoteIds = allNotes.map(n => n.id).filter(id => id);
      
      if (unorganizedNoteIds.length > 0) {
        // Find scripture notes referenced by unorganized notes
        const referencedScriptureNoteIds = await db
          .select({ 
            scriptureNoteId: NoteScriptureReferences.scriptureNoteId
          })
          .from(NoteScriptureReferences)
          .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(
            inArray(NoteScriptureReferences.noteId, unorganizedNoteIds),
            eq(Notes.userId, userId),
            eq(Notes.noteType, 'scripture')
          ))
          .all();

        // Get unique scripture note IDs (deduplicate)
        const uniqueReferencedScriptureIds = Array.from(
          new Set(referencedScriptureNoteIds.map(r => r.scriptureNoteId))
        );

        // Check which referenced scripture notes are NOT already in unorganized
        const alreadyCountedScriptureIds = new Set(
          allNotes.filter(n => n.noteType === 'scripture').map(n => n.id).filter(id => id)
        );

        const additionalScriptureCount = uniqueReferencedScriptureIds.filter(
          id => !alreadyCountedScriptureIds.has(id)
        ).length;

        scriptureCount += additionalScriptureCount;
        allCount += additionalScriptureCount;
      }
    } else {
      // For regular threads, use junction table
      const allNotes = await db.select({
        id: Notes.id,
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

      // Also count scripture notes referenced by notes in this thread
      const threadNoteIds = allNotes.map(n => n.id || '').filter(id => id);
      
      if (threadNoteIds.length > 0) {
        // Find scripture notes referenced by notes in this thread
        const referencedScriptureNoteIds = await db
          .select({ 
            scriptureNoteId: NoteScriptureReferences.scriptureNoteId,
            scriptureNoteType: Notes.noteType
          })
          .from(NoteScriptureReferences)
          .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
          .where(and(
            inArray(NoteScriptureReferences.noteId, threadNoteIds),
            eq(Notes.userId, userId),
            eq(Notes.noteType, 'scripture')
          ))
          .all();

        // Get unique scripture note IDs (deduplicate)
        const uniqueReferencedScriptureIds = new Set(
          referencedScriptureNoteIds.map(r => r.scriptureNoteId)
        );

        // Check which referenced scripture notes are NOT already directly in the thread
        const alreadyCountedScriptureIds = new Set(
          allNotes.filter(n => n.noteType === 'scripture').map(n => n.id).filter((id: string | undefined): id is string => !!id)
        );

        const additionalScriptureCount = Array.from(uniqueReferencedScriptureIds).filter(
          (id: string) => !alreadyCountedScriptureIds.has(id)
        ).length;

        scriptureCount += additionalScriptureCount;
        allCount += additionalScriptureCount;
      }
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
    .orderBy(desc(Notes.lastVisited), desc(Notes.createdAt), Notes.id)
    .limit(fetchLimit)
    .all();

    // Sort by lastVisited/createdAt, apply offset and limit
    // Note: Database already orders by lastVisited/createdAt, but we sort again
    // to ensure consistent ordering in case of ties
    // Use unified sorting utility for consistency
    const sortedAllNotes = sortByLastVisited(allNotes.map(note => ({
      ...note,
      updatedAt: note.updatedAt || note.createdAt,
      id: note.id || ''
    })));
    
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

    // Fetch thread colors for all notes in batch (optimized - single query instead of N queries)
    const noteIds = sortedNotes.map(note => note.id).filter((id): id is string => !!id);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
    
    const notesWithThreadColors = sortedNotes.map((note) => {
      const resourceMeta = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        resourceTitle: resourceMeta?.sourceTitle || null,
        resourceDescription: resourceMeta?.sourceDescription || null,
        resourceImage: resourceMeta?.sourceImage || null,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
      };
    });

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
      lastVisited: Notes.lastVisited,
    })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .orderBy(desc(Notes.updatedAt || Notes.createdAt))
    .limit(limit)
    .all();

    return notes.map(note => ({
      ...note,
      lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
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
    
    // Batch fetch note counts for all thread items in a single query (optimized - avoids N+1 problem)
    const threadItemIds = threadItems.map(item => item.id);
    let noteCountsMap = new Map<string, number>();
    
    if (threadItemIds.length > 0) {
      try {
        const noteCounts = await db
          .select({
            inboxItemId: InboxItemNotes.inboxItemId,
            count: count(),
          })
          .from(InboxItemNotes)
          .where(inArray(InboxItemNotes.inboxItemId, threadItemIds))
          .groupBy(InboxItemNotes.inboxItemId)
          .all();
        
        noteCountsMap = new Map(noteCounts.map(item => [item.inboxItemId, item.count]));
      } catch (error) {
        console.error('Error batch fetching note counts for featured content:', error);
      }
    }
    
    // Map inbox items to CardFeat format with note counts for threads
    return threadItems.map((item) => {
      const cleanContent = stripHtml(item.content || '');
      
      // Get note count from batch-fetched map
      const noteCount = noteCountsMap.get(item.id) || 0;
      
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
    });
  } catch (error) {
    console.error("Error fetching featured content:", error);
    return [];
  }
}

// Get content items for the main list (organized content + unorganized notes)
// filterExcludeReferencedScripture: if true, exclude scripture notes that are referenced by other notes (only for 'all' tab)
// threads: optional pre-fetched threads data to avoid duplicate query
export async function getContentItems(userId: string, limit = 20, offset = 0, filterExcludeReferencedScripture = false, threads?: any[]) {
  try {
    // Fetch enough items to cover offset + limit
    const fetchLimit = limit + offset;
    const [threadsData, assignedNotesRaw, unorganizedNotesRaw] = await Promise.all([
      // Use provided threads if available, otherwise fetch
      threads && Array.isArray(threads) ? Promise.resolve(threads) : getAllThreadsWithCounts(userId),
      getAssignedNotesForDashboard(userId, fetchLimit),
      getUnorganizedNotesForDashboard(userId, fetchLimit)
    ]);
    
    // Use threadsData (either provided or fetched) - ensure it's an array
    const threadsToUse = Array.isArray(threadsData) ? threadsData : [];
    
    // Use let so we can filter out referenced scripture notes later
    let assignedNotes = assignedNotesRaw;
    let unorganizedNotes = unorganizedNotesRaw;

    const threadItems = threadsToUse.map(thread => ({
      id: `thread-${thread.id}`,
      type: "thread" as const,
      title: thread.title,
      subtitle: `${thread.noteCount} notes`,
      count: thread.noteCount,
      threadId: thread.id, // Full ID including prefix
      spaceId: thread.spaceId,
      lastUpdated: thread.lastUpdated,
      updatedAt: thread.updatedAt || thread.createdAt, // Keep actual timestamp for sorting
      lastVisited: thread.lastVisited || thread.updatedAt || thread.createdAt, // Fallback to updatedAt/createdAt for consistent sorting
      createdAt: thread.createdAt,
      isPrivate: !thread.isPublic,
      accentColor: thread.accentColor,
      color: thread.color, // Include raw color value for components
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
        
        // Fetch thread colors for all scripture notes in batch (optimized - single query instead of N queries)
        const scriptureNoteIdsArray = Array.from(scriptureNoteIds).filter((id): id is string => !!id);
        const scriptureThreadColorsBatchMap = scriptureNoteIdsArray.length > 0
          ? await getThreadColorsForNotesBatch(scriptureNoteIdsArray, userId)
          : new Map<string, Array<{ color: string; frequency: number }>>();
        
        // Convert Map to Record for compatibility
        const scriptureThreadColorsMap: Record<string, Array<{ color: string; frequency: number }>> = {};
        for (const [noteId, threadColors] of scriptureThreadColorsBatchMap.entries()) {
          if (threadColors.length > 0) {
            scriptureThreadColorsMap[noteId] = threadColors;
          }
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
        
        // Only filter out referenced scripture notes if filterExcludeReferencedScripture is true
        // This should only happen in the 'all' tab, not in the 'scripture' tab
        if (filterExcludeReferencedScripture) {
          // Get set of scripture note IDs that are referenced by other notes (should be excluded from list)
          const referencedScriptureNoteIds = new Set(junctionEntries.map(e => e.scriptureNoteId));
          
          // Filter out scripture notes that are referenced by other notes
          // BUT: Keep scripture notes that have been recently visited (lastVisited is set)
          // This ensures visited scripture notes appear at the top even if they're referenced
          const now = Date.now();
          const RECENT_CREATION_THRESHOLD = 5000; // 5 seconds
          
          assignedNotes = assignedNotes.filter(note => {
            if (note.noteType !== 'scripture') return true; // Keep non-scripture notes
            
            // Filter out recently created scripture notes without lastVisited (handles race condition)
            // This catches newly created scripture notes before their junction entry is visible
            if (note.createdAt && !note.lastVisited) {
              const createdAtTime = new Date(note.createdAt).getTime();
              const isRecentlyCreated = (now - createdAtTime) < RECENT_CREATION_THRESHOLD;
              if (isRecentlyCreated) {
                return false; // Filter out recently created scripture notes without lastVisited
              }
            }
            
            if (!referencedScriptureNoteIds.has(note.id)) return true; // Keep non-referenced scripture notes
            // Keep referenced scripture notes that have been visited
            return note.lastVisited != null;
          });
          unorganizedNotes = unorganizedNotes.filter(note => {
            if (note.noteType !== 'scripture') return true; // Keep non-scripture notes
            
            // Filter out recently created scripture notes without lastVisited (handles race condition)
            // This catches newly created scripture notes before their junction entry is visible
            if (note.createdAt && !note.lastVisited) {
              const createdAtTime = new Date(note.createdAt).getTime();
              const isRecentlyCreated = (now - createdAtTime) < RECENT_CREATION_THRESHOLD;
              if (isRecentlyCreated) {
                return false; // Filter out recently created scripture notes without lastVisited
              }
            }
            
            if (!referencedScriptureNoteIds.has(note.id)) return true; // Keep non-referenced scripture notes
            // Keep referenced scripture notes that have been visited
            return note.lastVisited != null;
          });
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
        lastVisited: note.lastVisited || note.updatedAt || note.createdAt, // Fallback to updatedAt/createdAt for consistent sorting
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
        lastVisited: note.lastVisited || note.updatedAt || note.createdAt, // Fallback to updatedAt/createdAt for consistent sorting
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
    // The sorting function handles ties deterministically using ID as final tiebreaker
    // No need for intermediate sort - sortByLastVisited is stable and deterministic
    const allItemsArray = Array.from(allItemsMap.values());

    // Sort by lastVisited (newest first) and apply offset/limit
    const allItems = sortByLastVisited(allItemsArray)
      .slice(offset, offset + limit);

    return allItems;
  } catch (error) {
    console.error("Error fetching content items:", error);
    return [];
  }
}

// Fetch unorganized notes for dashboard (notes in unorganized thread)
// Batch helper function to fetch thread colors with frequency for multiple notes (optimized)
export async function getThreadColorsForNotesBatch(
  noteIds: string[], 
  userId: string
): Promise<Map<string, Array<{ color: string; frequency: number }>>> {
  if (noteIds.length === 0) return new Map();
  
  try {
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

    // Group by noteId, then by color, count frequency
    const noteColorMap = new Map<string, Map<string, number>>();
    for (const nt of allNoteThreads) {
      if (nt.color) {
        if (!noteColorMap.has(nt.noteId)) {
          noteColorMap.set(nt.noteId, new Map());
        }
        const colorMap = noteColorMap.get(nt.noteId)!;
        colorMap.set(nt.color, (colorMap.get(nt.color) || 0) + 1);
      }
    }

    // Convert to expected format: Map<noteId, Array<{color, frequency}>>
    const result = new Map<string, Array<{ color: string; frequency: number }>>();
    for (const [noteId, colorMap] of noteColorMap.entries()) {
      result.set(noteId, Array.from(colorMap.entries()).map(([color, frequency]) => ({
        color,
        frequency,
      })));
    }
    
    return result;
  } catch (error) {
    console.error(`Error batch fetching thread colors for notes:`, error);
    return new Map();
  }
}

/**
 * Wrapper function that returns thread colors as a Record instead of Map
 * Useful for compatibility with code that expects Record format
 */
export async function getThreadColorsForNotesAsRecord(
  noteIds: string[],
  userId: string
): Promise<Record<string, Array<{ color: string; frequency: number }>>> {
  const mapResult = await getThreadColorsForNotesBatch(noteIds, userId);
  const record: Record<string, Array<{ color: string; frequency: number }>> = {};
  for (const [noteId, colors] of mapResult.entries()) {
    record[noteId] = colors;
  }
  return record;
}

// Helper function to fetch thread colors with frequency for a note (kept for backward compatibility)
// Prefer using getThreadColorsForNotesBatch() for multiple notes
async function getThreadColorsForNote(noteId: string, userId: string): Promise<Array<{ color: string; frequency: number }>> {
  const batchResult = await getThreadColorsForNotesBatch([noteId], userId);
  return batchResult.get(noteId) || [];
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
    .orderBy(desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), Notes.id)
    .limit(limit)
    .all();

      // Fetch thread colors for all notes in batch (optimized - single query instead of N queries)
      const noteIds = notes.map(note => note.id).filter((id): id is string => !!id);
      const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
      
      const notesWithThreadColors = notes.map((note) => {
        const threadColors = threadColorsMap.get(note.id);
        return {
          ...note,
          lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
          threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
        };
      });

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
      .orderBy(desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), Notes.id)
      .limit(limit)
      .all();

      // Fetch thread colors for all notes in batch (optimized - single query instead of N queries)
      const noteIds = notes.map(note => note.id).filter((id): id is string => !!id);
      const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
      
      const notesWithThreadColors = notes.map((note) => {
        const threadColors = threadColorsMap.get(note.id);
        return {
          ...note,
          lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
          threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
        };
      });

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
    .orderBy(desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), Notes.id)
    .limit(limit)
    .all();

    // Fetch thread colors for all notes in batch (optimized - single query instead of N queries)
    const noteIds = notes.map(note => note.id).filter((id): id is string => !!id);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIds, userId);
    
    const notesWithThreadColors = notes.map((note) => {
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note,
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
      };
    });

    return notesWithThreadColors;
  } catch (error) {
    console.error("Error fetching assigned notes:", error);
    return [];
  }
}

// Fetch referenced scripture notes that don't have lastVisited
// These are scripture notes that are referenced by other notes but haven't been visited yet
// They should appear in the 'all' tab even though they're filtered out by the main API
export async function getReferencedScriptureNotesWithoutLastVisited(userId: string): Promise<any[]> {
  try {
    // Get all scripture note IDs that are referenced by other notes
    const junctionEntries = await db.select({
      scriptureNoteId: NoteScriptureReferences.scriptureNoteId,
    })
    .from(NoteScriptureReferences)
    .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
    .where(and(
      eq(Notes.userId, userId),
      eq(Notes.noteType, 'scripture')
    ))
    .all();

    // Get unique scripture note IDs
    const referencedScriptureNoteIds = [...new Set(junctionEntries.map(e => e.scriptureNoteId))];

    if (referencedScriptureNoteIds.length === 0) {
      return [];
    }

    // Fetch scripture notes that are referenced but don't have lastVisited
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
      inArray(Notes.id, referencedScriptureNoteIds),
      eq(Notes.userId, userId),
      eq(Notes.noteType, 'scripture'),
      isNull(Notes.lastVisited) // Only get notes without lastVisited
    ))
    .all();

    if (notes.length === 0) {
      return [];
    }

    // Batch fetch thread colors for all notes
    const noteIds = notes.map(note => note.id);
    let threadColorsMap: Record<string, Array<{ color: string; frequency: number }>> = {};

    if (noteIds.length > 0) {
      try {
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
          ne(Threads.id, "thread_unorganized")
        ))
        .all();

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

        for (const [noteId, colorMap] of noteColorMap.entries()) {
          threadColorsMap[noteId] = Array.from(colorMap.entries()).map(([color, frequency]) => ({
            color,
            frequency,
          }));
        }
      } catch (error) {
        console.error('Error batch fetching thread colors for referenced scripture notes:', error);
      }
    }

    // Format notes to match OrganizedContentItem interface
    const noteItems = notes.map(note => {
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
        lastVisited: null, // Explicitly null since we filtered for this
        createdAt: note.createdAt,
        threadColors: threadColorsMap[note.id] || undefined,
      };
    });

    return noteItems;
  } catch (error) {
    console.error("Error fetching referenced scripture notes without lastVisited:", error);
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
    .orderBy(desc(Notes.lastVisited), desc(Notes.createdAt), Notes.id)
    .limit(fetchLimit)
    .offset(offset)
    .all();

    // Sort in JavaScript to ensure correct ordering (lastVisited with fallback to createdAt)
    // Use unified sorting utility for consistency
    const sortedNotes = sortByLastVisited(notes.map(note => ({
      ...note,
      updatedAt: note.updatedAt || note.createdAt,
      id: note.id || ''
    })));

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
        lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        updatedAt: note.updatedAt || note.createdAt,
        lastVisited: note.lastVisited,
        createdAt: note.createdAt,
        threadColors: threadColorsMap[note.id] || undefined,
      };
    });

    const hasMore = sortedNotes.length > limit;

    return { items: noteItems, hasMore };
  } catch (error) {
    console.error("Error fetching scripture notes:", error);
    return { items: [], hasMore: false };
  }
}
