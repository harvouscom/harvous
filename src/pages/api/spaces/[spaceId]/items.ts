import type { APIRoute } from 'astro';
import { getNotesForSpace, getThreadsForSpace } from '@/utils/dashboard-data';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const GET: APIRoute = async ({ request, params, locals  }) => {
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

    const { spaceId } = params;
    
    if (!spaceId) {
      return new Response(JSON.stringify({ error: 'Space ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch notes and threads currently in the space
    // getNotesForSpace now returns { notes, hasMore }
    const [notesResult, threads] = await Promise.all([
      getNotesForSpace(spaceId, userId, 100), // Get up to 100 notes
      getThreadsForSpace(spaceId, userId)
    ]);
    const notes = notesResult.notes;

    return new Response(JSON.stringify({
      notes,
      threads
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error fetching space items:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to fetch space items' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

