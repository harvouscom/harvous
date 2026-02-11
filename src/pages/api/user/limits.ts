export const prerender = false;

import type { APIRoute } from 'astro';
import { getUserLimitsInfo } from '@/utils/tier-limits';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { successResponse, errorResponse, unauthorizedResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * GET /api/user/limits
 *
 * Get comprehensive tier limits and usage information for current user
 * Used to display usage stats and upgrade prompts in UI
 *
 * Returns:
 * - Current tier (free/unlimited)
 * - Usage vs limits for owned spaces, memberships, members per space
 * - Remaining capacity for each limit
 */
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting for read operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/user/limits', 'read', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    // Get comprehensive limits info
    const limitsInfo = await getUserLimitsInfo(userId, locals.auth());

    return successResponse(limitsInfo);

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/limits',
      action: 'get_user_limits',
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
