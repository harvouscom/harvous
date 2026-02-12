export const prerender = false;

import type { APIRoute } from 'astro';
import { db, SpaceInvitations, eq, and } from 'astro:db';
import { requireSpaceAccess } from '@/utils/space-permissions';
import { canAddMemberToSpace, canOwnerAddOneMoreSharedSpace } from '@/utils/tier-limits';
import { generateShareToken } from '@/utils/ids';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse
} from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * POST /api/spaces/[spaceId]/members/invite
 *
 * Invite a user to a collaborative space via email or generate shareable link
 *
 * Required: Space ownership
 * Body: { method: 'email' | 'link', email?: string, message?: string, expiresIn?: number }
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting - 10 invites per hour
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/members/invite', 'write', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    const { spaceId } = params;
    if (!spaceId) {
      return errorResponse('Space ID is required', 'INVALID_SPACE_ID');
    }

    // Verify user is space owner
    const { space } = await requireSpaceAccess(spaceId, userId, true);

    // Parse request body
    const body = await request.json();
    const { method, email, message, expiresIn = 7 } = body;

    if (!method || !['email', 'link'].includes(method)) {
      return errorResponse('Invalid invitation method. Must be "email" or "link"', 'INVALID_METHOD');
    }

    if (method === 'email' && !email) {
      return errorResponse('Email is required for email-based invitations', 'EMAIL_REQUIRED');
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return errorResponse('Invalid email format', 'INVALID_EMAIL');
      }
    }

    // Check tier limits - can space owner add more members?
    const canAdd = await canAddMemberToSpace(spaceId, space.userId, locals.auth());
    if (!canAdd.allowed) {
      return errorResponse(canAdd.reason || 'Cannot add more members to this space', 'MEMBER_LIMIT_REACHED', 403);
    }

    // Enforce owned shared spaces limit when adding the first member (invitation leads to join)
    const canAddShared = await canOwnerAddOneMoreSharedSpace(space.userId, spaceId, locals.auth());
    if (!canAddShared.allowed) {
      return errorResponse(canAddShared.reason || 'Shared space limit reached', 'OWNED_SHARED_SPACES_LIMIT_REACHED', 403);
    }

    // Check if invitation already exists for this email
    if (email) {
      const existing = await db.select()
        .from(SpaceInvitations)
        .where(
          and(
            eq(SpaceInvitations.spaceId, spaceId),
            eq(SpaceInvitations.invitedEmail, email),
            eq(SpaceInvitations.status, 'pending')
          )
        )
        .get();

      if (existing) {
        return errorResponse('An invitation has already been sent to this email', 'INVITATION_EXISTS', 409);
      }
    }

    // Generate unique invite token
    const inviteToken = generateShareToken();

    // Set expiration date
    let expiresAt: Date | undefined;
    if (expiresIn && expiresIn > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresIn);
    }

    // Create invitation
    const invitation = await db.insert(SpaceInvitations)
      .values({
        id: `invite_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        spaceId,
        invitedBy: userId,
        invitedEmail: email || null,
        invitedUserId: null, // Could look up if email matches existing user
        inviteToken,
        role: 'member',
        status: 'pending',
        message: message || null,
        expiresAt: expiresAt || null,
        createdAt: new Date(),
        acceptedAt: null,
      })
      .returning()
      .get();

    // Build invite URL
    const inviteUrl = `${request.url.split('/api')[0]}/invitations/${inviteToken}`;

    // For email method, you would send email here via Clerk or SMTP
    // TODO: Implement email sending
    // if (method === 'email') {
    //   await sendInvitationEmail(email, space.title, inviteUrl, message);
    // }

    // Return response based on method
    if (method === 'email') {
      return successResponse({
        success: true,
        invitationId: invitation.id,
        invitedEmail: email,
        message: 'Invitation sent! (Email sending not yet implemented)',
      });
    } else {
      return successResponse({
        success: true,
        inviteToken,
        inviteUrl,
        expiresAt: expiresAt || null,
      });
    }

  } catch (error: any) {
    // Handle permission errors from requireSpaceAccess
    if (error instanceof Response) {
      return error;
    }

    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/members/invite',
      action: 'invite_member',
      spaceId: params.spaceId,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
