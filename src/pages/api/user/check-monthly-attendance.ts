export const prerender = false;

import type { APIRoute } from 'astro';
import { awardMonthlyAttendanceXP } from '@/utils/xp-system';
import { handleAPIError } from '@/utils/error-handling';

export const POST: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
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

