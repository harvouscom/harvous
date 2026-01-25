import type { APIRoute } from 'astro';
import { db, Threads, eq, and } from 'astro:db';
import { generateShareToken, isValidShareToken } from '@/utils/ids';
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

    // Fetch thread and verify ownership
    const thread = await db
      .select({
        id: Threads.id,
        isPublic: Threads.isPublic,
        shareToken: Threads.shareToken,
        shareTokenCreatedAt: Threads.shareTokenCreatedAt,
        userId: Threads.userId
      })
      .from(Threads)
      .where(eq(Threads.id, threadId))
      .get();

    if (!thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (thread.userId !== userId) {
      return new Response(JSON.stringify({ error: 'You do not have permission to access this thread' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return current share status
    return new Response(JSON.stringify({
      isPublic: thread.isPublic,
      shareToken: thread.shareToken,
      shareUrl: thread.shareToken ? `${new URL(params.url || 'https://app.harvous.com').origin}/shared/thread/${thread.shareToken}` : null,
      shareTokenCreatedAt: thread.shareTokenCreatedAt
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/[threadId]/share',
      action: 'get_share_status',
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

export const POST: APIRoute = async ({ params, request, locals }) => {
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

    const body = await request.json();
    const { action } = body;

    if (!action || !['enable', 'disable', 'refresh'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action. Must be enable, disable, or refresh' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch thread and verify ownership
    const thread = await db
      .select({
        id: Threads.id,
        isPublic: Threads.isPublic,
        shareToken: Threads.shareToken,
        userId: Threads.userId
      })
      .from(Threads)
      .where(eq(Threads.id, threadId))
      .get();

    if (!thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (thread.userId !== userId) {
      return new Response(JSON.stringify({ error: 'You do not have permission to modify this thread' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    let newShareToken: string | null = null;
    let isPublic = thread.isPublic;

    if (action === 'enable') {
      // Generate a new share token and enable sharing
      newShareToken = generateShareToken();
      isPublic = true;

      await db
        .update(Threads)
        .set({
          isPublic: true,
          shareToken: newShareToken,
          shareTokenCreatedAt: now,
          updatedAt: now
        })
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

    } else if (action === 'disable') {
      // Clear share token and disable sharing
      newShareToken = null;
      isPublic = false;

      await db
        .update(Threads)
        .set({
          isPublic: false,
          shareToken: null,
          shareTokenCreatedAt: null,
          updatedAt: now
        })
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

    } else if (action === 'refresh') {
      // Generate a new share token (invalidates old links)
      if (!thread.isPublic) {
        return new Response(JSON.stringify({ error: 'Cannot refresh share link for a private thread' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      newShareToken = generateShareToken();
      isPublic = true;

      await db
        .update(Threads)
        .set({
          shareToken: newShareToken,
          shareTokenCreatedAt: now,
          updatedAt: now
        })
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));
    }

    // Build the share URL
    const origin = new URL(request.url).origin;
    const shareUrl = newShareToken ? `${origin}/shared/thread/${newShareToken}` : null;

    return new Response(JSON.stringify({
      success: true,
      isPublic,
      shareToken: newShareToken,
      shareUrl,
      shareTokenCreatedAt: action !== 'disable' ? now : null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/[threadId]/share',
      action: 'update_share_status',
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
