import type { APIRoute } from 'astro';
import { db, Spaces, Threads, Notes, eq, and } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/delete', 'write', ip);
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

    // Get space ID from URL params
    const url = new URL(request.url);
    const spaceId = url.searchParams.get('spaceId');

    if (!spaceId) {
      return new Response(JSON.stringify({ error: 'Space ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the space belongs to the user before deleting
    const existingSpace = await db.select()
      .from(Spaces)
      .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
      .get();

    if (!existingSpace) {
      return new Response(JSON.stringify({ error: 'Space not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove threads from space (set spaceId to null) - preserve threads and their notes
    // Don't update updatedAt - only metadata change, not content change
    await db.update(Threads)
      .set({ 
        spaceId: null
      })
      .where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, userId)));

    // Remove standalone notes from space (set spaceId to null) - preserve notes
    // Don't update updatedAt - only metadata change, not content change
    await db.update(Notes)
      .set({ 
        spaceId: null
      })
      .where(and(eq(Notes.spaceId, spaceId), eq(Notes.userId, userId)));

    // Finally, delete the space itself
    await db.delete(Spaces)
      .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)));

    return new Response(JSON.stringify({ 
      success: "Space erased!",
      spaceId: spaceId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/delete',
      action: 'delete_space'
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
