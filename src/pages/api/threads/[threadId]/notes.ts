import type { APIRoute } from 'astro';
import { getNotesForThread } from '@/utils/dashboard-data';

export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const threadId = params.threadId;
    if (!threadId) {
      return new Response(JSON.stringify({ error: 'Thread ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    const notes = await getNotesForThread(threadId, userId, limit, offset);
    const hasMore = notes.length === limit; // Simple check for now

    return new Response(JSON.stringify({
      notes,
      hasMore,
      offset,
      limit
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error(`Error loading more notes for thread ${params.threadId}:`, error);
    return new Response(JSON.stringify({ 
      error: 'Failed to load more notes',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

