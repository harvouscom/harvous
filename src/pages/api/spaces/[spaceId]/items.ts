export const prerender = false;

import type { APIRoute } from 'astro';
import { getNotesForSpace, getThreadsForSpace } from '@/utils/dashboard-data';
import { requireSpaceAccess } from '@/utils/space-permissions';
import { unauthorizedResponse, errorResponse, successResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    const { spaceId } = params;

    if (!spaceId) {
      return errorResponse('Space ID is required', 'INVALID_SPACE_ID');
    }

    // NEW: Verify user has access (owner or member)
    // This replaces the implicit permission check in getNotesForSpace/getThreadsForSpace
    await requireSpaceAccess(spaceId, userId);

    // Fetch notes and threads currently in the space
    // getNotesForSpace now returns { notes, hasMore }
    const [notesResult, threads] = await Promise.all([
      getNotesForSpace(spaceId, userId, 100), // Get up to 100 notes
      getThreadsForSpace(spaceId, userId)
    ]);
    const notes = notesResult.notes;

    return successResponse({
      notes,
      threads
    });

  } catch (error: any) {
    // Handle permission errors from requireSpaceAccess
    if (error instanceof Response) {
      return error;
    }

    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/items',
      action: 'fetch_space_items',
      spaceId: params.spaceId,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};

