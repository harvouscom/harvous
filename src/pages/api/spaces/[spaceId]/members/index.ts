export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Members, SpaceInvitations, UserMetadata, eq, and, inArray } from 'astro:db';
import { requireSpaceAccess } from '@/utils/space-permissions';
import { getUserTier, getTierLimits } from '@/utils/tier-limits';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { successResponse, errorResponse, unauthorizedResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * GET /api/spaces/[spaceId]/members
 *
 * List all members of a space with their details
 * Also includes pending invitations
 *
 * Required: Space membership (owner or member)
 */
export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting for read operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/members', 'read', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    const { spaceId } = params;
    if (!spaceId) {
      return errorResponse('Space ID is required', 'INVALID_SPACE_ID');
    }

    // Verify user has access (owner or member)
    const { role, space } = await requireSpaceAccess(spaceId, userId);

    // Get all members of the space
    const memberRecords = await db.select()
      .from(Members)
      .where(eq(Members.spaceId, spaceId))
      .all();

    // Get user details for all members
    const memberUserIds = memberRecords.map(m => m.userId);

    // Also include the space owner if they're not in Members table
    if (!memberUserIds.includes(space.userId)) {
      memberUserIds.push(space.userId);
    }

    // Fetch user metadata for all members
    const userMetadata = await db.select()
      .from(UserMetadata)
      .where(inArray(UserMetadata.userId, memberUserIds))
      .all();

    // Create a map of userId -> metadata
    const userMetadataMap = new Map(
      userMetadata.map(meta => [meta.userId, meta])
    );

    // Build members array with user details
    const members = [];

    // Add space owner first
    const ownerMeta = userMetadataMap.get(space.userId);
    members.push({
      userId: space.userId,
      role: 'owner',
      firstName: ownerMeta?.firstName || null,
      lastName: ownerMeta?.lastName || null,
      email: ownerMeta?.email || null,
      profileImageUrl: ownerMeta?.profileImageUrl || null,
      userColor: ownerMeta?.userColor || 'paper',
      joinedAt: space.createdAt, // Owner joined when space was created
    });

    // Add other members
    for (const member of memberRecords) {
      const meta = userMetadataMap.get(member.userId);
      members.push({
        userId: member.userId,
        role: member.role,
        firstName: meta?.firstName || null,
        lastName: meta?.lastName || null,
        email: meta?.email || null,
        profileImageUrl: meta?.profileImageUrl || null,
        userColor: meta?.userColor || 'paper',
        joinedAt: member.createdAt,
      });
    }

    // Get pending invitations (only if user is owner)
    let pendingInvitations = [];
    if (role === 'owner') {
      const invitations = await db.select()
        .from(SpaceInvitations)
        .where(
          and(
            eq(SpaceInvitations.spaceId, spaceId),
            eq(SpaceInvitations.status, 'pending')
          )
        )
        .all();

      pendingInvitations = invitations.map(inv => ({
        id: inv.id,
        invitedEmail: inv.invitedEmail,
        invitedUserId: inv.invitedUserId,
        inviteToken: inv.inviteToken,
        message: inv.message,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      }));
    }

    const payload: {
      members: typeof members;
      pendingInvitations: typeof pendingInvitations;
      totalMembers: number;
      isOwner: boolean;
      memberLimit?: number;
    } = {
      members,
      pendingInvitations,
      totalMembers: members.length,
      isOwner: role === 'owner',
    };
    if (role === 'owner') {
      const tier = getUserTier(locals.auth());
      payload.memberLimit = getTierLimits(tier).membersPerSpace;
    }
    return successResponse(payload);

  } catch (error: any) {
    // Handle permission errors from requireSpaceAccess
    if (error instanceof Response) {
      return error;
    }

    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/members',
      action: 'list_members',
      spaceId: params.spaceId,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
