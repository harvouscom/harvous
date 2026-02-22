export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Threads, eq, and } from 'astro:db';
import { isSpaceMember } from '@/utils/space-permissions';

const jsonHeaders = { 'Content-Type': 'application/json' } as const;
const THROTTLE_MS = 3 * 1000;

/**
 * POST /api/threads/[threadId]/visit
 * Records a visit to a thread for lastVisited ordering on the dashboard.
 * Only updates lastVisited when the authenticated user is the thread owner.
 * Returns 200 if the user has access (owner or space member); 404 otherwise.
 * Throttled: only updates if lastVisited is older than 3 seconds (matches Astro SSR behavior).
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: jsonHeaders
      });
    }

    let { threadId } = params;
    if (!threadId) {
      return new Response(JSON.stringify({ error: 'Thread ID required' }), {
        status: 400,
        headers: jsonHeaders
      });
    }
    if (!threadId.startsWith('thread_')) {
      threadId = `thread_${threadId}`;
    }

    // Optional: skip if this is a prefetch request
    const isPrefetch = request.headers.get('x-prefetch-request') || request.headers.get('purpose') === 'prefetch';
    if (isPrefetch) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
    }

    const thread = await db.select({ id: Threads.id, userId: Threads.userId, spaceId: Threads.spaceId, lastVisited: Threads.lastVisited })
      .from(Threads)
      .where(eq(Threads.id, threadId))
      .get();

    if (!thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: jsonHeaders
      });
    }

    const isOwner = thread.userId === userId;
    const isMember = thread.spaceId ? await isSpaceMember(thread.spaceId, userId) : false;

    if (!isOwner && !isMember) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: jsonHeaders
      });
    }

    // Only the owner's lastVisited is updated (matches Astro [...slug].astro behavior)
    if (isOwner) {
      const now = new Date();
      const threeSecondsAgo = new Date(now.getTime() - THROTTLE_MS);
      if (!thread.lastVisited || new Date(thread.lastVisited) < threeSecondsAgo) {
        await db.update(Threads)
          .set({ lastVisited: now })
          .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
  } catch (error: any) {
    console.error('[visit] Error updating lastVisited for thread:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: jsonHeaders
    });
  }
};
