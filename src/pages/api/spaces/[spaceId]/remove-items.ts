export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Notes, Threads, eq, and } from 'astro:db';
import { requireSpaceAccess } from '@/utils/space-permissions';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';

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
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/remove-items', 'write', ip);
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

    const { spaceId } = params;
    const body = await request.json();
    const { noteIds = [], threadIds = [] } = body;

    if (!spaceId) {
      return new Response(JSON.stringify({ error: 'Space ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify user has access to space (owner or member); owner can remove any item; members only their own
    const { role } = await requireSpaceAccess(spaceId, userId);

    const errors: string[] = [];
    const removedNotes: string[] = [];
    const removedThreads: string[] = [];

    // Remove notes from space (set spaceId to null)
    if (noteIds.length > 0) {
      for (const noteId of noteIds) {
        try {
          const note = role === 'owner'
            ? await db.select()
                .from(Notes)
                .where(and(eq(Notes.id, noteId), eq(Notes.spaceId, spaceId)))
                .get()
            : await db.select()
                .from(Notes)
                .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId), eq(Notes.spaceId, spaceId)))
                .get();

          if (!note) {
            errors.push(`Note ${noteId} not found`);
            continue;
          }

          if (note.spaceId !== spaceId) {
            errors.push(`Note ${noteId} is not in this space`);
            continue;
          }

          if (role === 'owner') {
            await db.update(Notes)
              .set({ spaceId: null })
              .where(and(eq(Notes.id, noteId), eq(Notes.spaceId, spaceId)));
          } else {
            await db.update(Notes)
              .set({ spaceId: null })
              .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
          }

          removedNotes.push(noteId);
        } catch (error: any) {
          errors.push(`Failed to remove note ${noteId}: ${error.message}`);
        }
      }
    }

    // Remove threads from space (set spaceId to null)
    if (threadIds.length > 0) {
      for (const threadId of threadIds) {
        try {
          if (threadId === 'thread_unorganized') {
            errors.push('Cannot remove unorganized thread');
            continue;
          }

          const thread = role === 'owner'
            ? await db.select()
                .from(Threads)
                .where(and(eq(Threads.id, threadId), eq(Threads.spaceId, spaceId)))
                .get()
            : await db.select()
                .from(Threads)
                .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId), eq(Threads.spaceId, spaceId)))
                .get();

          if (!thread) {
            errors.push(`Thread ${threadId} not found`);
            continue;
          }

          if (thread.spaceId !== spaceId) {
            errors.push(`Thread ${threadId} is not in this space`);
            continue;
          }

          if (role === 'owner') {
            await db.update(Threads)
              .set({ spaceId: null })
              .where(and(eq(Threads.id, threadId), eq(Threads.spaceId, spaceId)));
          } else {
            await db.update(Threads)
              .set({ spaceId: null })
              .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));
          }

          removedThreads.push(threadId);
        } catch (error: any) {
          errors.push(`Failed to remove thread ${threadId}: ${error.message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Removed ${removedNotes.length} note(s) and ${removedThreads.length} thread(s) from space`,
      removedNotes,
      removedThreads,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error removing items from space:', error);
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/remove-items',
      action: 'remove_items_from_space',
      spaceId: params?.spaceId,
    });
    return new Response(JSON.stringify({
      error: standardError.message,
      code: standardError.code,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

