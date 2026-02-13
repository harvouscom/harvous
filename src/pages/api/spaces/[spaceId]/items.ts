export const prerender = false;

import type { APIRoute } from 'astro';
import { getNotesForSpace, getThreadsForSpace, getThreadsForSpaceBySpaceId, getNotesForSpaceForMember } from '@/utils/dashboard-data';
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

    // Verify user has access (owner or member) and get role + space
    const { role, space } = await requireSpaceAccess(spaceId, userId);

    let notes: any[];
    let threads: any[];

    if (role === 'owner') {
      const [notesResult, threadsData] = await Promise.all([
        getNotesForSpace(spaceId, userId, 100),
        getThreadsForSpace(spaceId, userId)
      ]);
      notes = notesResult.notes;
      threads = threadsData;
    } else {
      const [threadsData, notesResult] = await Promise.all([
        getThreadsForSpaceBySpaceId(spaceId),
        getNotesForSpaceForMember(spaceId, space.userId, 100)
      ]);
      threads = threadsData;
      notes = notesResult.notes;
    }

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

