import type { APIRoute } from 'astro';
import { calculateTotalXP, getXPBreakdown, backfillUserXP, getSeasonalXP, getLifetimeXP } from '@/utils/xp-system';
import { getSeasonDisplayName, getCurrentSeason } from '@/utils/season-helpers';
import { handleAPIError } from '@/utils/error-handling';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
    }

    // Check if this is a backfill request
    const url = new URL(request.url);
    const shouldBackfill = url.searchParams.get('backfill') === 'true';
    const season = url.searchParams.get('season'); // Optional season parameter
    
    if (shouldBackfill) {
      await backfillUserXP(userId);
    }

    // Get XP data (both seasonal and lifetime)
    const [seasonalXP, lifetimeXP, breakdown] = await Promise.all([
      getSeasonalXP(userId, season || undefined),
      getLifetimeXP(userId),
      getXPBreakdown(userId)
    ]);

    return new Response(JSON.stringify({
      seasonalXP,
      lifetimeXP,
      totalXP: lifetimeXP, // Legacy field for backward compatibility
      season: season || getCurrentSeason(),
      seasonName: getSeasonDisplayName(season || undefined),
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
