export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Threads, Spaces, Members, eq, and } from 'astro:db';
import { getNotesForThread, getNotesForThreadForMember } from '@/utils/dashboard-data';
import { requireSpaceAccess } from '@/utils/space-permissions';
import { handleAPIError } from '@/utils/error-handling';

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

    // Owner path: getNotesForThread returns { notes, hasMore } or [] on error
    let result = await getNotesForThread(threadId, userId, limit, offset);
    if (Array.isArray(result)) {
      result = { notes: [], hasMore: false };
    }

    // If owner path returned no notes and offset is 0, try member path (thread in a space the user is a member of)
    if (result.notes.length === 0 && offset === 0) {
      const thread = await db.select().from(Threads).where(eq(Threads.id, threadId)).get();
      if (thread?.spaceId) {
        let memberNotesResult: { notes: any[]; hasMore: boolean } | null = null;
        try {
          const { space } = await requireSpaceAccess(thread.spaceId, userId);
          memberNotesResult = await getNotesForThreadForMember(threadId, space.userId, limit, offset);
        } catch {
          // requireSpaceAccess threw – try direct Members check
          const spaceRow = await db.select().from(Spaces).where(eq(Spaces.id, thread.spaceId)).get();
          const memberRow = await db.select().from(Members).where(and(eq(Members.spaceId, thread.spaceId), eq(Members.userId, userId))).get();
          if (spaceRow && memberRow) {
            memberNotesResult = await getNotesForThreadForMember(threadId, spaceRow.userId, limit, offset);
          }
        }
        if (memberNotesResult) result = memberNotesResult;
      }
    }

    const { notes, hasMore } = result;

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

