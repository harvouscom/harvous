import type { APIRoute } from 'astro';
import { getThreadNoteTypeCounts } from '@/utils/dashboard-data';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ params, locals }) => {
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

    const noteTypeCounts = await getThreadNoteTypeCounts(threadId, userId);

    return new Response(JSON.stringify({
      noteTypeCounts
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/[threadId]/note-type-counts',
      action: 'get_thread_note_type_counts',
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

