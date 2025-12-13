import type { APIRoute } from 'astro';
import { db, Notes, Threads, NoteThreads, eq, and } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { moveScriptureNotesToThread } from '@/utils/move-scripture-notes-to-thread';

export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/notes/[id]/add-thread', 'write', ip);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: rateLimit.error,
        code: 'RATE_LIMIT_EXCEEDED'
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateLimit.remaining || 0),
          'X-RateLimit-Reset': String(rateLimit.resetTime || Date.now())
        }
      });
    }

    const { id } = params;
    const { threadId } = await request.json();

    if (!id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Note ID is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!threadId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Thread ID is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the note exists and belongs to the user
    const note = await db.select()
      .from(Notes)
      .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
      .get();

    if (!note) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Note not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the target thread exists and belongs to the user
    const targetThread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
      .get();

    if (!targetThread) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Target thread not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if the note is already in this thread
    const existingRelation = await db.select()
      .from(NoteThreads)
      .where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)))
      .get();

    if (existingRelation) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Note is already in this thread' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if note is currently in unorganized (no NoteThreads entries)
    const existingThreadRelations = await db.select()
      .from(NoteThreads)
      .where(eq(NoteThreads.noteId, id))
      .all();
    
    const isInUnorganized = existingThreadRelations.length === 0 || note.threadId === 'thread_unorganized';

    // Add the note to the thread (many-to-many relationship)
    try {
      const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteThreads).values({
        id: noteThreadId,
        noteId: id,
        threadId: threadId,
        createdAt: new Date()
      });
      
      // If note was in unorganized, update the legacy threadId field to the new thread
      // This ensures the note is properly removed from unorganized
      if (isInUnorganized && threadId !== 'thread_unorganized') {
        await db.update(Notes)
          .set({ threadId: threadId })
          .where(eq(Notes.id, id));
      }
      
      // Update the target thread's timestamp
      await db.update(Threads)
        .set({ updatedAt: new Date() })
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

      // Move scripture notes referenced by this note to the same thread (fire and forget)
      // Don't await to avoid database lock contention - let it run asynchronously
      // The helper function has built-in delays and retry logic to handle SQLITE_BUSY errors
      moveScriptureNotesToThread(id, threadId, userId).catch((error) => {
        console.error('Error moving scripture notes (non-blocking):', error);
      });
    } catch (insertError) {
      const standardError = handleAPIError(insertError, {
        endpoint: '/api/notes/[id]/add-thread',
        action: 'add_note_to_thread'
      });
      return new Response(JSON.stringify({ 
        success: false, 
        error: standardError.message,
        code: standardError.code
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Note added to thread',
      note: {
        id: note.id,
        threadId: threadId
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/[id]/add-thread',
      action: 'add_note_to_thread'
    });
    return new Response(JSON.stringify({ 
      success: false, 
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
