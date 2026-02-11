export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Spaces, Members, eq, and } from 'astro:db';
import { canAddMemberToSpace } from '@/utils/tier-limits';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';
import { idToUrl } from '@/utils/url-helpers';

/**
 * POST /api/spaces/join/[token]
 *
 * Join a public collaborative space using a permanent share link
 *
 * Required: Valid share token, authenticated user
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting - 10 joins per hour
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/join/[token]', 'write', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    const { token } = params;
    if (!token) {
      return errorResponse('Share token is required', 'INVALID_TOKEN');
    }

    // Find space by share token
    const space = await db.select()
      .from(Spaces)
      .where(eq(Spaces.shareToken, token))
      .get();

    if (!space) {
      return errorResponse('Invalid or expired share link', 'INVALID_TOKEN', 404);
    }

    // Check if space is still public
    if (!space.isPublic) {
      return errorResponse('This space is no longer public', 'SPACE_NOT_PUBLIC', 403);
    }

    // Check if user is already a member or owner
    if (space.userId === userId) {
      return errorResponse('You are the owner of this space', 'ALREADY_OWNER', 400);
    }

    const existingMember = await db.select()
      .from(Members)
      .where(and(
        eq(Members.spaceId, space.id),
        eq(Members.userId, userId)
      ))
      .get();

    if (existingMember) {
      return errorResponse('You are already a member of this space', 'ALREADY_MEMBER', 400);
    }

    // Check tier limits - can space owner add more members?
    const canAdd = await canAddMemberToSpace(space.id, space.userId, locals.auth());
    if (!canAdd.allowed) {
      return errorResponse(
        canAdd.reason || 'This space has reached its member limit',
        'MEMBER_LIMIT_REACHED',
        403
      );
    }

    // Add user as member
    await db.insert(Members)
      .values({
        id: `member_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        spaceId: space.id,
        userId,
        role: 'member',
        createdAt: new Date(),
        joinedAt: new Date(),
      });

    // Return success with redirect URL
    return successResponse({
      success: true,
      spaceId: space.id,
      spaceName: space.title,
      redirectUrl: idToUrl(space.id),
      message: `Welcome to ${space.title}!`,
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/join/[token]',
      action: 'join_space',
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
