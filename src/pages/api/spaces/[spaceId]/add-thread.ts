import type { APIRoute } from 'astro';
import { db, Threads, Spaces, eq, and } from 'astro:db';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const POST: APIRoute = async ({ params, request, locals }) => {
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
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/add-thread', 'write', ip);
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
    const { threadId } = body;

    if (!spaceId) {
      return new Response(JSON.stringify({ error: 'Space ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!threadId) {
      return new Response(JSON.stringify({ error: 'Thread ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the space exists and belongs to the user
    const space = await db.select()
      .from(Spaces)
      .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
      .get();

    if (!space) {
      return new Response(JSON.stringify({ error: 'Space not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the thread exists and belongs to the user
    const thread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
      .get();

    if (!thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Don't allow moving unorganized thread
    if (threadId === 'thread_unorganized') {
      return new Response(JSON.stringify({ error: 'Cannot move unorganized thread' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update the thread's spaceId
    // Don't update updatedAt - only metadata change, not content change
    await db.update(Threads)
      .set({ 
        spaceId: spaceId
      })
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

    return new Response(JSON.stringify({
      success: true,
      message: 'Thread added to space'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error adding thread to space:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to add thread to space' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

