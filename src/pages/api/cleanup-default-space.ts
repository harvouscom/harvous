import type { APIRoute } from 'astro';
import { db, Spaces, eq, and } from 'astro:db';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals  }) => {
  // Restrict to development only - this is a one-time cleanup script
  if (import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: 'Cleanup endpoints are not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get userId from authenticated context
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


    // Delete the default space for this user
    const result = await db.delete(Spaces)
      .where(and(eq(Spaces.id, 'default_space'), eq(Spaces.userId, userId)));


    return new Response(JSON.stringify({ 
      success: "Default space cleaned up!"
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error cleaning up default space:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to clean up default space' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
