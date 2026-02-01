export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';
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
    const rateLimit = rateLimitMiddleware(userId, '/api/notes/delete', 'write', ip);
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

    // Get note ID from URL params
    const url = new URL(request.url);
    const noteId = url.searchParams.get('noteId');

    if (!noteId) {
      return new Response(JSON.stringify({ error: 'Note ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the note belongs to the user before deleting
    const existingNote = await db.select()
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .get();

    if (!existingNote) {
      return new Response(JSON.stringify({ error: 'Note not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Store threadId before deletion for redirect
    const threadId = existingNote.threadId;
    const noteCreatedAt = existingNote.createdAt;

    // Delete the note first (critical operation)
    await db.delete(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));

    // Revoke XP (async, fire-and-forget)
    const revokeXPAsync = async () => {
      try {
        await revokeXPOnDeletion(userId, noteId, noteCreatedAt);
        await revokeAllXPForItem(userId, noteId);
      } catch (error) {
        console.error('XP revocation failed (non-critical):', error);
      }
    };
    revokeXPAsync().catch(() => {});

    return new Response(JSON.stringify({ 
      success: "Note erased!",
      noteId: noteId,
      threadId: threadId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/delete',
      action: 'delete_note'
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
