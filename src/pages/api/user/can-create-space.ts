export const prerender = false;

import type { APIRoute } from 'astro';
import { canCreateSharedSpace } from '@/utils/tier-limits';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { successResponse, errorResponse, unauthorizedResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * GET /api/user/can-create-space
 *
 * Check if user can create a new shared space based on tier limits
 *
 * Returns:
 * - allowed: boolean
 * - reason: string (if not allowed)
 * - current: number (current owned spaces)
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
    const rateLimit = rateLimitMiddleware(userId, '/api/user/can-create-space', 'read', ip);
    if (!rateLimit.allowed) {
      return errorResponse(rateLimit.error, 'RATE_LIMIT_EXCEEDED', 429);
    }

    // Check if user can create shared space
    const canCreate = await canCreateSharedSpace(userId, locals.auth());

    return successResponse(canCreate);

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/can-create-space',
      action: 'check_can_create_space',
    });

    return errorResponse(standardError.message, standardError.code, 500);
  }
};
