import type { APIRoute } from 'astro';
import { db, Notes, Threads, Comments, Tags, NoteTags, NoteThreads, ScriptureMetadata, ResourceMetadata, NoteScriptureReferences, eq, and, count, desc } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';

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
        version = undefined;
      }
    }

    // Fetch resource metadata if this is a resource note
    let resourceTitle: string | null = null;
    let resourceDescription: string | null = null;
    let resourceImage: string | null = null;
    if (note.noteType === 'resource') {
      try {
        const resourceMeta = await db.select()
          .from(ResourceMetadata)
          .where(eq(ResourceMetadata.noteId, noteId))
          .get();
        resourceTitle = resourceMeta?.sourceTitle || null;
        resourceDescription = resourceMeta?.sourceDescription || null;
        resourceImage = resourceMeta?.sourceImage || null;
      } catch (error: any) {
        // Resource metadata not found or error - use null values
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

      // Filter out "Unorganized" threads - they shouldn't appear in the threads list
      allThreads = junctionThreads.filter(thread => thread.title !== 'Unorganized');
    } catch (error) {
      allThreads = [];
    }

    // Use only junction table - no primary thread fallback
    // If no threads found, note is unorganized (no junction entries)

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
      // Get note count for this thread using junction table only (single source of truth)
      const junctionCountResult = await db.select({ count: count() })
        .from(Notes)
        .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
        .where(and(eq(NoteThreads.threadId, thread.id), eq(Notes.userId, userId)))
        .get();
      
      const noteCount = junctionCountResult?.count || 0;
      
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

    // Get all notes that reference this scripture (only for scripture notes)
    let referencingNotes: Array<{
      id: string;
      title: string | null;
      content: string;
      simpleNoteId: number | null;
      noteType: string;
      createdAt: Date;
      updatedAt: Date | null;
    }> = [];
    
    if (note.noteType === 'scripture') {
      try {
        const junctionEntries = await db
          .select({
            id: Notes.id,
            title: Notes.title,
            content: Notes.content,
            simpleNoteId: Notes.simpleNoteId,
            noteType: Notes.noteType,
            createdAt: Notes.createdAt,
            updatedAt: Notes.updatedAt
          })
          .from(NoteScriptureReferences)
          .innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id))
          .where(
            and(
              eq(NoteScriptureReferences.scriptureNoteId, noteId),
              eq(Notes.userId, userId)
            )
          )
          .orderBy(desc(Notes.updatedAt))
          .all();
        
        referencingNotes = junctionEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          simpleNoteId: entry.simpleNoteId,
          noteType: entry.noteType || 'default',
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }));
      } catch (error) {
        // If error (e.g., table doesn't exist yet), just return empty array
        referencingNotes = [];
      }
    }

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
        addedBy: note.addedBy || 'user',
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        version: version,
        resourceTitle: resourceTitle,
        resourceDescription: resourceDescription,
        resourceImage: resourceImage
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
      })),
      referencingNotes: referencingNotes.map(refNote => ({
        id: refNote.id,
        title: refNote.title,
        content: refNote.content,
        simpleNoteId: refNote.simpleNoteId,
        noteType: refNote.noteType,
        createdAt: refNote.createdAt,
        updatedAt: refNote.updatedAt
      }))
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/[id]/details',
      action: 'get_note_details'
    });
    return new Response(JSON.stringify({ 
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
