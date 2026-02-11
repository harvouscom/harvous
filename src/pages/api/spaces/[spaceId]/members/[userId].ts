export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Members, eq, and } from 'astro:db';
import { requireSpaceAccess } from '@/utils/space-permissions';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { successResponse, errorResponse, unauthorizedResponse, forbiddenResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * DELETE /api/spaces/[spaceId]/members/[userId]
 *
 * Remove a member from a space
 *
 * Authorization:
 * - Space owner can remove any member
 * - Members can remove themselves (leave space)
 * - Owner cannot remove themselves
 */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/members/[userId]', 'write', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    const { spaceId, userId: targetUserId } = params;

    if (!spaceId) {
      return errorResponse('Space ID is required', 'INVALID_SPACE_ID');
    }

    if (!targetUserId) {
      return errorResponse('User ID is required', 'INVALID_USER_ID');
    }

    // Get space and verify caller has access
    const { role, space } = await requireSpaceAccess(spaceId, userId);

    // Check authorization
    const isOwner = role === 'owner';
    const isSelf = targetUserId === userId;

    // Only owner OR self can remove
    if (!isOwner && !isSelf) {
      return forbiddenResponse('You do not have permission to remove this member');
    }

    // Prevent owner from removing themselves
    if (isOwner && isSelf) {
      return errorResponse(
        'Cannot remove yourself as the space owner. Transfer ownership first or delete the space.',
        'OWNER_CANNOT_LEAVE',
        400
      );
    }

    // Verify target user is actually a member
    const member = await db.select()
      .from(Members)
      .where(and(
        eq(Members.spaceId, spaceId),
        eq(Members.userId, targetUserId)
      ))
      .get();

    if (!member) {
      return errorResponse('User is not a member of this space', 'NOT_A_MEMBER', 404);
    }

    // Remove member
    await db.delete(Members)
      .where(and(
        eq(Members.spaceId, spaceId),
        eq(Members.userId, targetUserId)
      ));

    return successResponse({
      success: true,
      message: isSelf ? 'You have left the space' : 'Member removed successfully',
      removedUserId: targetUserId,
    });

  } catch (error: any) {
    // Handle permission errors from requireSpaceAccess
    if (error instanceof Response) {
      return error;
    }

    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/members/[userId]',
      action: 'remove_member',
      spaceId: params.spaceId,
      targetUserId: params.userId,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
