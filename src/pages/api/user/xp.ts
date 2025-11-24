import type { APIRoute } from 'astro';
import { calculateTotalXP, getXPBreakdown, backfillUserXP } from '@/utils/xp-system';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if this is a backfill request
    const url = new URL(request.url);
    const shouldBackfill = url.searchParams.get('backfill') === 'true';
    
    if (shouldBackfill) {
      await backfillUserXP(userId);
    }

    // Get XP data
    const totalXP = await calculateTotalXP(userId);
    const breakdown = await getXPBreakdown(userId);

    return new Response(JSON.stringify({
      totalXP,
      breakdown,
      backfilled: shouldBackfill
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/xp',
      action: 'get_user_xp'
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
