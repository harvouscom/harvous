export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Threads, eq } from 'astro:db';
import { getThreadNoteTypeCounts, getThreadNoteTypeCountsForMember } from '@/utils/dashboard-data';
import { requireSpaceAccess } from '@/utils/space-permissions';
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

    let noteTypeCounts = await getThreadNoteTypeCounts(threadId, userId);

    // Member path: if owner path returned all zeros, try thread in shared space
    if (noteTypeCounts.all === 0 && noteTypeCounts.default === 0 && noteTypeCounts.scripture === 0 && noteTypeCounts.resource === 0) {
      const thread = await db.select().from(Threads).where(eq(Threads.id, threadId)).get();
      if (thread?.spaceId) {
        try {
          await requireSpaceAccess(thread.spaceId, userId);
          noteTypeCounts = await getThreadNoteTypeCountsForMember(threadId);
        } catch {
          // No access – keep zeros
        }
      }
    }

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

