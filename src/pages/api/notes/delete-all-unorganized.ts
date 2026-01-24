import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    // Get authenticated user
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

    // Delete all notes from the unorganized thread
    const result = await db.delete(Notes)
      .where(and(
        eq(Notes.userId, userId),
        eq(Notes.threadId, 'thread_unorganized')
      ));


    return new Response(JSON.stringify({ 
      success: true, 
      message: 'All notes deleted from unorganized thread' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error deleting unorganized thread notes:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to erase notes from unorganized thread' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
