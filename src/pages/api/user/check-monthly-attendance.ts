import type { APIRoute } from 'astro';
import { awardMonthlyAttendanceXP } from '@/utils/xp-system';
import { handleAPIError } from '@/utils/error-handling';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals  }) => {
  try {
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
    }

    // Award monthly attendance XP if eligible
    const awarded = await awardMonthlyAttendanceXP(userId);

    return new Response(JSON.stringify({
      success: true,
      awardedXP: awarded,
      xpAmount: awarded ? 25 : 0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/check-monthly-attendance',
      action: 'check_monthly_attendance'
    });
    return new Response(JSON.stringify({
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

