export const prerender = false;

import type { APIRoute } from 'astro';
import { canJoinSpace } from '@/utils/tier-limits';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { successResponse, errorResponse, unauthorizedResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * GET /api/user/can-join-space
 *
 * Check if user can join another space based on tier limits
 *
 * Returns:
 * - allowed: boolean
 * - reason: string (if not allowed)
 * - current: number (current space memberships)
 * - limit: number (max allowed)
 */
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting for read operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/user/can-join-space', 'read', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    // Check if user can join more spaces
    const canJoin = await canJoinSpace(userId, locals.auth());

    return successResponse(canJoin);

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/can-join-space',
      action: 'check_can_join_space',
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
