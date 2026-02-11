export const prerender = false;

import type { APIRoute } from 'astro';
import { db, SpaceInvitations, eq } from 'astro:db';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * POST /api/invitations/[token]/decline
 *
 * Decline an invitation
 * Optional: Can decline without authentication (just update status)
 */
export const POST: APIRoute = async ({ params, locals }) => {
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

    // Verify invitation is still pending
    if (invitation.status !== 'pending') {
      return errorResponse(
        `This invitation has already been ${invitation.status}`,
        'INVITATION_NOT_PENDING',
        410
      );
    }

    // Update invitation status to declined
    await db.update(SpaceInvitations)
      .set({ status: 'declined' })
      .where(eq(SpaceInvitations.id, invitation.id));

    return successResponse({
      success: true,
      message: 'Invitation declined',
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/invitations/[token]/decline',
      action: 'decline_invitation',
      token: params.token,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
