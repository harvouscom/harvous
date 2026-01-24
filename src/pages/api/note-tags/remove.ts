import type { APIRoute } from 'astro';
import { db, NoteTags, eq, and } from 'astro:db';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    let userId: string | null = null;

    // SSR Mode: Use middleware auth
    if (locals?.auth) {
      const auth = locals.auth();
      userId = auth.userId || null;
    }
    // Static/Capacitor Mode: Verify JWT from Authorization header
    else {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const verified = await verifyToken(token, {
            secretKey: import.meta.env.CLERK_SECRET_KEY
          });
          userId = verified.sub;
        } catch (error) {
          console.error('[API Auth] Token verification failed:', error);
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/note-tags/remove', 'write', ip);
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
    const noteId = url.searchParams.get('noteId');
    const tagId = url.searchParams.get('tagId');

    if (!noteId || !tagId) {
      return new Response(JSON.stringify({ error: 'Note ID and Tag ID are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove the note-tag relationship
    const result = await db
      .delete(NoteTags)
      .where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)));

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Tag removed from note' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error removing tag from note:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
