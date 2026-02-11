export const prerender = false;

import type { APIRoute } from 'astro';
import { db, SpaceInvitations, Spaces, Members, eq, and } from 'astro:db';
import { canJoinSpace } from '@/utils/tier-limits';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse
} from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';
import { idToUrl } from '@/utils/url-helpers';

/**
 * POST /api/invitations/[token]/accept
 *
 * Accept an invitation and join the space
 *
 * Required: User authentication
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse('You must be signed in to accept invitations');
    }

    // Rate limiting
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/invitations/[token]/accept', 'write', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    const { token } = params;

    if (!token) {
      return errorResponse('Invitation token is required', 'INVALID_TOKEN');
    }

    // Get invitation
    const invitation = await db.select()
      .from(SpaceInvitations)
      .where(eq(SpaceInvitations.inviteToken, token))
      .get();

    if (!invitation) {
      return notFoundResponse('Invitation');
    }

    // Verify invitation is still pending
    if (invitation.status !== 'pending') {
      return errorResponse(
        `This invitation has already been ${invitation.status}`,
        'INVITATION_NOT_PENDING',
        410
      );
    }

    // Check if invitation is expired
    if (invitation.expiresAt && new Date() > new Date(invitation.expiresAt)) {
      // Update invitation status to expired
      await db.update(SpaceInvitations)
        .set({ status: 'expired' })
        .where(eq(SpaceInvitations.id, invitation.id));

      return errorResponse('This invitation has expired', 'INVITATION_EXPIRED', 410);
    }

    // Get space details
    const space = await db.select()
      .from(Spaces)
      .where(eq(Spaces.id, invitation.spaceId))
      .get();

    if (!space) {
      return notFoundResponse('Space');
    }

    // Check if user is the space owner
    if (space.userId === userId) {
      return errorResponse('You are already the owner of this space', 'ALREADY_OWNER', 400);
    }

    // Check if user is already a member
    const existingMember = await db.select()
      .from(Members)
      .where(and(
        eq(Members.spaceId, invitation.spaceId),
        eq(Members.userId, userId)
      ))
      .get();

    if (existingMember) {
      // Update invitation to accepted even though they're already a member
      await db.update(SpaceInvitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
        })
        .where(eq(SpaceInvitations.id, invitation.id));

      return errorResponse('You are already a member of this space', 'ALREADY_MEMBER', 400);
    }

    // Check tier limits - can user join another space?
    const canJoin = await canJoinSpace(userId, locals.auth());
    if (!canJoin.allowed) {
      return forbiddenResponse(canJoin.reason || 'Cannot join more spaces');
    }

    // All checks passed - add user as member
    const member = await db.insert(Members)
      .values({
        id: `member_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        spaceId: invitation.spaceId,
        role: invitation.role || 'member',
        createdAt: new Date(),
      })
      .returning()
      .get();

    // Update invitation status
    await db.update(SpaceInvitations)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
      })
      .where(eq(SpaceInvitations.id, invitation.id));

    // Return success with space details for redirect (use idToUrl so redirect goes to /space/xxx)
    return successResponse({
      success: true,
      space: {
        id: space.id,
        title: space.title,
        color: space.color,
      },
      redirectUrl: idToUrl(space.id),
      member,
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/invitations/[token]/accept',
      action: 'accept_invitation',
      token: params.token,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
