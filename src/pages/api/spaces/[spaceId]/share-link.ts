export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Spaces, eq } from 'astro:db';
import { requireSpaceAccess } from '@/utils/space-permissions';
import { generateShareToken } from '@/utils/ids';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * GET /api/spaces/[spaceId]/share-link
 *
 * Get the permanent share link for a public space
 *
 * Required: Space member access
 */
export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    const { spaceId } = params;
    if (!spaceId) {
      return errorResponse('Space ID is required', 'INVALID_SPACE_ID');
    }

    // Verify user has access to space
    const { space } = await requireSpaceAccess(spaceId, userId, false);

    // Only return share link if space is public
    if (!space.isPublic) {
      return successResponse({
        shareUrl: null,
        isPublic: false,
      });
    }

    // If no share token exists, generate one
    let shareToken = space.shareToken;
    if (!shareToken) {
      shareToken = generateShareToken();

      await db.update(Spaces)
        .set({ shareToken })
        .where(eq(Spaces.id, spaceId));
    }

    // Build share URL
    const baseUrl = request.url.split('/api')[0];
    const shareUrl = `${baseUrl}/spaces/join/${shareToken}`;

    return successResponse({
      shareUrl,
      shareToken,
      isPublic: true,
    });

  } catch (error: any) {
    // Handle permission errors from requireSpaceAccess
    if (error instanceof Response) {
      return error;
    }

    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/share-link',
      action: 'get_share_link',
      spaceId: params.spaceId,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};

/**
 * POST /api/spaces/[spaceId]/share-link
 *
 * Refresh the permanent share link (generates new token, invalidates old one)
 *
 * Required: Space ownership
 * Body: { action: 'refresh' }
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting - 5 refreshes per hour
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/[spaceId]/share-link', 'write', ip);
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
    const { action } = body;

    if (action !== 'refresh') {
      return errorResponse('Invalid action. Must be "refresh"', 'INVALID_ACTION');
    }

    // Only allow refreshing if space is public
    if (!space.isPublic) {
      return errorResponse('Cannot generate share link for private space', 'SPACE_NOT_PUBLIC', 403);
    }

    // Generate new share token
    const newShareToken = generateShareToken();

    await db.update(Spaces)
      .set({ shareToken: newShareToken })
      .where(eq(Spaces.id, spaceId));

    // Build new share URL
    const baseUrl = request.url.split('/api')[0];
    const shareUrl = `${baseUrl}/spaces/join/${newShareToken}`;

    return successResponse({
      shareUrl,
      shareToken: newShareToken,
      message: 'Share link refreshed successfully',
    });

  } catch (error: any) {
    // Handle permission errors from requireSpaceAccess
    if (error instanceof Response) {
      return error;
    }

    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/share-link',
      action: 'refresh_share_link',
      spaceId: params.spaceId,
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
