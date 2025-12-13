import type { APIRoute } from 'astro';
import { db, Notes, NoteThreads, eq, and } from 'astro:db';
import { ensureUnorganizedThread } from '@/utils/unorganized-thread';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { removeScriptureNotesFromThread } from '@/utils/remove-scripture-notes-from-thread';

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
    const rateLimit = rateLimitMiddleware(userId, '/api/notes/[id]/remove-thread', 'write', ip);
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

    // Check if the note is in this thread
    const existingRelation = await db.select()
      .from(NoteThreads)
      .where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)))
      .get();

    if (!existingRelation) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Note is not in this thread' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove the note from the thread
    try {
      await db.delete(NoteThreads)
        .where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)));
      
      // Check if this was the last thread for the note
      const remainingThreads = await db.select()
        .from(NoteThreads)
        .where(eq(NoteThreads.noteId, id))
        .all();
      
      if (remainingThreads.length === 0) {
        // This was the last thread, note automatically becomes unorganized (no junction entries)
        // Just ensure unorganized thread exists and set primary threadId to unorganized (legacy field)
        await ensureUnorganizedThread(userId);
        await db.update(Notes)
          .set({ threadId: 'thread_unorganized' })
          .where(eq(Notes.id, id));
      }
      // Note: If note still has other threads, no action needed - primary threadId stays as legacy field

      // Remove scripture notes referenced by this note from the thread (fire and forget)
      // Don't await to avoid database lock contention - let it run asynchronously
      // The helper function has built-in delays and retry logic to handle SQLITE_BUSY errors
      removeScriptureNotesFromThread(id, threadId, userId).catch((error) => {
        console.error('Error removing scripture notes (non-blocking):', error);
      });
    } catch (deleteError) {
      const standardError = handleAPIError(deleteError, {
        endpoint: '/api/notes/[id]/remove-thread',
        action: 'remove_note_from_thread'
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
      message: 'Note removed from thread',
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
      endpoint: '/api/notes/[id]/remove-thread',
      action: 'remove_note_from_thread'
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
