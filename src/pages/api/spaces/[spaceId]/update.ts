import type { APIRoute } from 'astro';
import { db, Spaces, eq, and } from 'astro:db';
import { getThreadGradientCSS } from '@/utils/colors';
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
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/update', 'write', ip);
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
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;

    if (!spaceId) {
      return new Response(JSON.stringify({ error: 'Space ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!title || !title.trim()) {
      return new Response(JSON.stringify({ error: 'Title is required' }), {
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

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const backgroundGradient = getThreadGradientCSS(color || space.color || 'paper');

    // Update the space
    const updatedSpace = await db.update(Spaces)
      .set({
        title: capitalizedTitle,
        color: color || space.color,
        backgroundGradient: backgroundGradient,
        updatedAt: new Date()
      })
      .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
      .returning()
      .get();

    return new Response(JSON.stringify({
      success: 'Space updated!',
      space: updatedSpace
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error updating space:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to update space' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

