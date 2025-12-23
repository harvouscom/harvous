import type { APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, eq, and } from 'astro:db';
import { revokeXPOnDeletion, revokeAllXPForItem } from '@/utils/xp-system';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/threads/delete', 'write', ip);
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

    // Get thread ID from URL params
    const url = new URL(request.url);
    const threadId = url.searchParams.get('threadId');

    if (!threadId) {
      return new Response(JSON.stringify({ error: 'Thread ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the thread belongs to the user before deleting
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

    // Don't allow deleting the unorganized thread
    if (threadId === 'thread_unorganized') {
      return new Response(JSON.stringify({ error: 'Cannot delete the unorganized thread' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Store creation time before deletion for XP revocation
    const threadCreatedAt = existingThread.createdAt;

    // Revoke XP if deleted within quick deletion window
    await revokeXPOnDeletion(userId, threadId, threadCreatedAt);
    
    // Revoke all XP for this thread (cleanup)
    await revokeAllXPForItem(userId, threadId);

    // Remove all NoteThreads relationships for this thread
    // Notes automatically become unorganized when junction entries are deleted
    const affectedNotes = await db.select({ noteId: NoteThreads.noteId })
      .from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId))
      .all();
    
    await db.delete(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId));
    
    // Set all affected notes' primary threadId to unorganized (legacy field)
    // Don't update updatedAt - only metadata change, not content change
    if (affectedNotes.length > 0) {
      const noteIds = affectedNotes.map(n => n.noteId);
      // Update each note individually (Astro DB doesn't support IN clause directly)
      for (const noteId of noteIds) {
        await db.update(Notes)
          .set({ 
            threadId: 'thread_unorganized'
          })
          .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
      }
    }

    // Then delete the thread itself
    await db.delete(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

    // Dispatch thread deleted event for navigation updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('threadDeleted', {
        detail: { threadId: threadId }
      }));
    }

    return new Response(JSON.stringify({ 
      success: "Thread erased! Notes have been moved to the Unorganized thread.",
      threadId: threadId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/delete',
      action: 'delete_thread'
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
