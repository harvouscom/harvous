import type { APIRoute } from 'astro';
import { getNotesForThread } from '@/utils/dashboard-data';
import { handleAPIError } from '@/utils/error-handling';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
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

    // getNotesForThread now returns { notes, hasMore }
    // It fetches limit + offset + 1 items internally to determine hasMore
    const { notes, hasMore } = await getNotesForThread(threadId, userId, limit, offset);

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
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/[threadId]/notes',
      action: 'get_thread_notes',
      threadId: params.threadId
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

