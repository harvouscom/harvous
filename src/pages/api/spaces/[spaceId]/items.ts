import type { APIRoute } from 'astro';
import { getNotesForSpace, getThreadsForSpace } from '@/utils/dashboard-data';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const GET: APIRoute = async ({ request, params, locals  }) => {
  try {
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
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

