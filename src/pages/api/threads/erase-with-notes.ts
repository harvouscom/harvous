import type { APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, NoteTags, Comments, ScriptureMetadata, NoteScriptureReferences, eq, and } from 'astro:db';
import { revokeXPOnDeletion, revokeAllXPForItem } from '@/utils/xp-system';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/threads/erase-with-notes', 'write', ip);
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

    const url = new URL(request.url);
    const threadId = url.searchParams.get('threadId');

    if (!threadId) {
      return new Response(JSON.stringify({ error: 'Thread ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the thread belongs to the user
    const existingThread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
      .get();

    if (!existingThread) {
      return new Response(JSON.stringify({ error: 'Thread not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Don't allow erasing unorganized thread
    if (threadId === 'thread_unorganized') {
      return new Response(JSON.stringify({ error: 'Cannot erase the unorganized thread' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const threadCreatedAt = existingThread.createdAt;

    // Get all notes in this thread
    const affectedNotes = await db.select({ noteId: NoteThreads.noteId })
      .from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId))
      .all();

    const noteIds = affectedNotes.map(n => n.noteId);

    // Delete all related data for each note
    for (const noteId of noteIds) {
      // Get note to check creation time for XP revocation
      const note = await db.select()
        .from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
        .get();

      if (note) {
        // Revoke XP for the note
        await revokeXPOnDeletion(userId, noteId, note.createdAt);
        await revokeAllXPForItem(userId, noteId);

        // Delete all related data
        await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
        await db.delete(Comments).where(eq(Comments.noteId, noteId));
        await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
        // Delete both directions of scripture references
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.noteId, noteId));
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.scriptureNoteId, noteId));
      }
    }

    // Delete all NoteThreads relationships
    await db.delete(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId));

    // Delete all notes in the thread permanently
    if (noteIds.length > 0) {
      for (const noteId of noteIds) {
        await db.delete(Notes)
          .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
      }
    }

    // Revoke XP for the thread
    await revokeXPOnDeletion(userId, threadId, threadCreatedAt);
    await revokeAllXPForItem(userId, threadId);

    // Delete the thread itself
    await db.delete(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

    // Dispatch events (server-side, so we can't use window - events will be dispatched client-side)
    // The client will handle event dispatching when it receives the response

    return new Response(JSON.stringify({ 
      success: "Thread and all notes erased!",
      threadId: threadId,
      notesDeleted: noteIds.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/erase-with-notes',
      action: 'erase_thread_with_notes'
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

