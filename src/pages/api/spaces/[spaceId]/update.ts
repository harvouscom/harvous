export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Spaces, eq, and } from 'astro:db';
import { getThreadGradientCSS } from '@/utils/colors';
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
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/update', 'write', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    const { spaceId } = params;
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;
    const isPublicStr = formData.get('isPublic') as string | null;

    if (!spaceId) {
      return errorResponse('Space ID is required', 'INVALID_SPACE_ID');
    }

    if (!title || !title.trim()) {
      return errorResponse('Title is required', 'INVALID_TITLE');
    }

    // Verify user is owner (only owner can update space settings)
    const { space } = await requireSpaceAccess(spaceId, userId, true);

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const backgroundGradient = getThreadGradientCSS(color || space.color || 'paper');

    // Build update object
    const updateData: any = {
      title: capitalizedTitle,
      color: color || space.color,
      backgroundGradient: backgroundGradient,
      updatedAt: new Date()
    };

    // Update isPublic if provided
    if (isPublicStr !== null) {
      updateData.isPublic = isPublicStr === 'true';
    }

    // Update the space
    const updatedSpace = await db.update(Spaces)
      .set(updateData)
      .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
      .returning()
      .get();

    return successResponse({
      success: 'Space updated!',
      space: updatedSpace
    });

  } catch (error: any) {
    // Handle permission errors from requireSpaceAccess
    if (error instanceof Response) {
      return error;
    }

    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/update',
      action: 'update_space',
      spaceId: params.spaceId,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};

