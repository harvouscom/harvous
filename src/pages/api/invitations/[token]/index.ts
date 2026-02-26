export const prerender = false;

import type { APIRoute } from 'astro';
import { db, SpaceInvitations, Spaces, Members, UserMetadata, eq, and } from 'astro:db';
import { successResponse, errorResponse, notFoundResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * GET /api/invitations/[token]
 *
 * Get invitation details - PUBLIC endpoint (no auth required)
 * Shows space info, inviter details, and whether user can accept
 */
export const GET: APIRoute = async ({ params, locals }) => {
  try {
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

    // Check if invitation is expired
    const isExpired = invitation.expiresAt && new Date() > new Date(invitation.expiresAt);

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return errorResponse(
        `This invitation has been ${invitation.status}`,
        'INVITATION_NOT_PENDING',
        410
      );
    }

    // Get space details
    const space = await db.select()
      .from(Spaces)
      .where(eq(Spaces.id, invitation.spaceId))
      .get();

    if (!space) {
      return notFoundResponse('Space');
    }

    // Get inviter details (first name + last initial only; never full last name)
    const inviter = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, invitation.invitedBy))
      .get();
    const inviterFirst = inviter?.firstName || '';
    const inviterLastInitial = inviter?.lastName ? inviter.lastName.charAt(0).toUpperCase() : '';
    const inviterDisplayName = inviterFirst
      ? (inviterLastInitial ? `${inviterFirst} ${inviterLastInitial}.` : inviterFirst)
      : 'A Harvous User';

    // Check if current user (if logged in) is already a member
    const { userId } = locals.auth();
    let alreadyMember = false;
    let canAccept = !isExpired;

    if (userId) {
      // Check if user is already the owner
      if (space.userId === userId) {
        alreadyMember = true;
        canAccept = false;
      } else {
        // Check if user is already a member
        const existingMember = await db.select()
          .from(Members)
          .where(and(
            eq(Members.spaceId, invitation.spaceId),
            eq(Members.userId, userId)
          ))
          .get();

        if (existingMember) {
          alreadyMember = true;
          canAccept = false;
        }
      }
    }

    return successResponse({
      invitation: {
        spaceTitle: space.title,
        spaceColor: space.color || 'paper',
        invitedBy: { displayName: inviterDisplayName },
        message: invitation.message,
        expiresAt: invitation.expiresAt,
        isExpired,
        status: invitation.status,
      },
      canAccept,
      alreadyMember,
      requiresAuth: !userId, // User needs to sign in to accept
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/invitations/[token]',
      action: 'view_invitation',
      token: params.token,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
