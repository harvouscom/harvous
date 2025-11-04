import type { APIRoute } from 'astro';
import { db, Notes, Threads, Comments, Tags, NoteTags, NoteThreads, ScriptureMetadata, eq, and, count } from 'astro:db';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const noteId = params.id;

    if (!noteId) {
      return new Response(JSON.stringify({ error: 'Note ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log("Fetching note details for ID:", noteId, "for user:", userId);

    // First, verify the note belongs to the user
    const note = await db.select()
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .get();

    if (!note) {
      return new Response(JSON.stringify({ error: 'Note not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log("Note ID:", noteId);
    console.log("Note threadId:", note.threadId);

    // Fetch scripture metadata if this is a scripture note
    let version: string | undefined;
    if (note.noteType === 'scripture') {
      try {
        const scriptureMeta = await db.select()
          .from(ScriptureMetadata)
          .where(eq(ScriptureMetadata.noteId, noteId))
          .get();
        version = scriptureMeta?.translation;
      } catch (error: any) {
        console.log("Error querying ScriptureMetadata:", error);
        version = undefined;
      }
    }

    // Get all user threads first
    const allUserThreads = await db.select({
      id: Threads.id,
      title: Threads.title,
      color: Threads.color,
      isPublic: Threads.isPublic,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt
    })
      .from(Threads)
      .where(eq(Threads.userId, userId))
      .all();

    console.log("Total user threads:", allUserThreads.length);

    // Get threads from junction table (many-to-many)
    let allThreads = [];
    try {
      const junctionThreads = await db
        .select({
          id: Threads.id,
          title: Threads.title,
          subtitle: Threads.subtitle,
          color: Threads.color,
          isPublic: Threads.isPublic,
          isPinned: Threads.isPinned,
          createdAt: Threads.createdAt,
          updatedAt: Threads.updatedAt
        })
        .from(Threads)
        .innerJoin(NoteThreads, eq(NoteThreads.threadId, Threads.id))
        .where(and(eq(NoteThreads.noteId, noteId), eq(Threads.userId, userId)))
        .all();

      console.log("Junction table threads found:", junctionThreads.length);
      // Filter out "Unorganized" threads - they shouldn't appear in the threads list
      allThreads = junctionThreads.filter(thread => thread.title !== 'Unorganized');
      console.log("Threads after filtering out Unorganized:", allThreads.length);
    } catch (error) {
      console.log("Error querying junction table:", error);
      allThreads = [];
    }

    // If no threads in junction table, check if we have a primary thread and auto-populate
    if (allThreads.length === 0 && note.threadId) {
      console.log("No junction threads, checking primary thread:", note.threadId);
      try {
        const primaryThread = await db.select()
          .from(Threads)
          .where(and(eq(Threads.id, note.threadId), eq(Threads.userId, userId)))
          .get();
        
        if (primaryThread) {
          // Only include non-Unorganized threads in the results
          if (primaryThread.title !== 'Unorganized') {
            allThreads = [primaryThread];
            console.log("Found primary thread:", primaryThread.title);
          } else {
            console.log("Primary thread is Unorganized, not showing in threads list");
            allThreads = [];
          }
          
          // Auto-populate the junction table for backward compatibility (only if not Unorganized)
          if (primaryThread.title !== 'Unorganized') {
            try {
              await db.insert(NoteThreads).values({
                noteId: noteId,
                threadId: note.threadId
              });
              console.log("Auto-populated junction table with primary thread");
            } catch (insertError) {
              console.log("Note: Junction table entry may already exist:", insertError);
            }
          }
        } else {
          console.log("Primary thread not found or doesn't belong to user");
        }
      } catch (error) {
        console.log("Error querying primary thread:", error);
      }
    }

    console.log("Final threads to return:", allThreads.length);
    console.log("Thread titles:", allThreads.map(t => t.title));

    // Helper function to format relative time (same as original)
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

    // Format all threads that contain this note (many-to-many relationship)
    const formattedThreads = await Promise.all(allThreads.map(async (thread) => {
      // Get note count for this thread (both primary threadId and junction table)
      const primaryCountResult = await db.select({ count: count() })
        .from(Notes)
        .where(and(eq(Notes.threadId, thread.id), eq(Notes.userId, userId)));
      
      const junctionCountResult = await db.select({ count: count() })
        .from(Notes)
        .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(NoteThreads.threadId, thread.id), eq(Notes.userId, userId)));
      
      // Combine both counts and remove duplicates
      const primaryCount = primaryCountResult[0]?.count || 0;
      const junctionCount = junctionCountResult[0]?.count || 0;
      
      // For now, use the maximum of the two counts to avoid double counting
      // In a more sophisticated implementation, we'd need to deduplicate
      const noteCount = Math.max(primaryCount, junctionCount);
      
      return {
        id: thread.id,
        title: thread.title,
        subtitle: thread.subtitle || "Thread",
        color: thread.color,
        isPublic: thread.isPublic,
        isPinned: thread.isPinned,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        count: noteCount
      };
    }));

    // Use the allUserThreads we already fetched above

    // Get all comments for this note
    const comments = await db.select({
      id: Comments.id,
      content: Comments.content,
      createdAt: Comments.createdAt,
      updatedAt: Comments.updatedAt
    })
    .from(Comments)
    .where(and(eq(Comments.noteId, noteId), eq(Comments.userId, userId)))
    .orderBy(Comments.createdAt);

    // Get all tags for this note
    const noteTags = await db
      .select({
        id: Tags.id,
        name: Tags.name,
        color: Tags.color,
        category: Tags.category,
        isSystem: Tags.isSystem,
        isAutoGenerated: NoteTags.isAutoGenerated,
        confidence: NoteTags.confidence
      })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, userId)))
      .orderBy(Tags.name);

    // Format the response
    const response = {
      success: true,
      note: {
        id: note.id,
        title: note.title,
        content: note.content,
        threadId: note.threadId,
        spaceId: note.spaceId,
        simpleNoteId: note.simpleNoteId,
        noteType: note.noteType || 'default',
        isPublic: note.isPublic,
        isFeatured: note.isFeatured,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        version: version
      },
      threads: formattedThreads,
      allUserThreads: allUserThreads.map(thread => ({
        id: thread.id,
        title: thread.title,
        color: thread.color,
        isPublic: thread.isPublic,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      })),
      comments: comments.map(comment => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt
      })),
      tags: noteTags.map(tag => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        category: tag.category,
        isSystem: tag.isSystem,
        isAutoGenerated: tag.isAutoGenerated,
        confidence: tag.confidence
      }))
    };

    console.log("Note details fetched successfully:", {
      noteId,
      allThreadsCount: allThreads.length,
      commentCount: comments.length,
      tagCount: noteTags.length,
      allThreads: allThreads.map(t => ({ id: t.id, title: t.title }))
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error fetching note details:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to fetch note details' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
