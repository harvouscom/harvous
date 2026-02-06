export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';
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
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/add-note', 'write', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    const { spaceId } = params;
    const body = await request.json();
    const { noteId } = body;

    if (!spaceId) {
      return errorResponse('Space ID is required', 'INVALID_SPACE_ID');
    }

    if (!noteId) {
      return errorResponse('Note ID is required', 'INVALID_NOTE_ID');
    }

    // Verify user has access to space (owner or member)
    await requireSpaceAccess(spaceId, userId);

    // Verify the note exists and belongs to the user
    const note = await db.select()
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .get();

    if (!note) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update the note's spaceId
    // Don't update updatedAt - only metadata change, not content change
    await db.update(Notes)
      .set({
        spaceId: spaceId
      })
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));

    return successResponse({
      success: true,
      message: 'Note added to space'
    });

  } catch (error: any) {
    // Handle permission errors from requireSpaceAccess
    if (error instanceof Response) {
      return error;
    }

    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/add-note',
      action: 'add_note_to_space',
      spaceId: params.spaceId,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};

