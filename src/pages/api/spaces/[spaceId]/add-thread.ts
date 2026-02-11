export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Threads, eq, and } from 'astro:db';
import { requireSpaceAccess } from '@/utils/space-permissions';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { successResponse, errorResponse, unauthorizedResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/add-thread', 'write', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    const { spaceId } = params;
    const body = await request.json();
    const { threadId } = body;

    if (!spaceId) {
      return errorResponse('Space ID is required', 'INVALID_SPACE_ID');
    }

    if (!threadId) {
      return errorResponse('Thread ID is required', 'INVALID_THREAD_ID');
    }

    // Verify user has access to space (owner or member)
    await requireSpaceAccess(spaceId, userId);

    // Verify the thread exists and belongs to the user
    const thread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
      .get();

    if (!thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Don't allow moving unorganized thread
    if (threadId === 'thread_unorganized') {
      return errorResponse('Cannot move unorganized thread', 'INVALID_THREAD', 400);
    }

    // Update the thread's spaceId
    // Don't update updatedAt - only metadata change, not content change
    await db.update(Threads)
      .set({
        spaceId: spaceId
      })
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

    return successResponse({
      success: true,
      message: 'Thread added to space'
    });

  } catch (error: any) {
    // Handle permission errors from requireSpaceAccess
    if (error instanceof Response) {
      return error;
    }

    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/add-thread',
      action: 'add_thread_to_space',
      spaceId: params.spaceId,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};

