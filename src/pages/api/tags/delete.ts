import type { APIRoute } from 'astro';
import { db, Tags, NoteTags, eq, and } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/tags/delete', 'write', ip);
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
    const tagId = url.searchParams.get('tagId');

    if (!tagId) {
      return new Response(JSON.stringify({ error: 'Tag ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if tag exists and belongs to user
    const tag = await db
      .select()
      .from(Tags)
      .where(and(eq(Tags.id, tagId), eq(Tags.userId, userId)))
      .get();

    if (!tag) {
      return new Response(JSON.stringify({ error: 'Tag not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Don't allow deletion of system tags
    if (tag.isSystem) {
      return new Response(JSON.stringify({ error: 'Cannot delete system tags' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove all note-tag relationships first
    await db.delete(NoteTags).where(eq(NoteTags.tagId, tagId));

    // Delete the tag
    await db.delete(Tags).where(eq(Tags.id, tagId));

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Tag deleted' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/tags/delete',
      action: 'delete_tag'
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
