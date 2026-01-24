import type { APIRoute } from 'astro';
import { calculateTotalXP, getXPBreakdown, backfillUserXP, getSeasonalXP, getLifetimeXP } from '@/utils/xp-system';
import { getSeasonDisplayName, getCurrentSeason } from '@/utils/season-helpers';
import { handleAPIError } from '@/utils/error-handling';
import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    let userId: string | null = null;

    // SSR Mode: Use middleware auth
    if (locals?.auth) {
      const auth = locals.auth();
      userId = auth.userId || null;
    }
    // Static/Capacitor Mode: Verify JWT from Authorization header
    else {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const verified = await verifyToken(token, {
            secretKey: import.meta.env.CLERK_SECRET_KEY
          });
          userId = verified.sub;
        } catch (error) {
          console.error('[API Auth] Token verification failed:', error);
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
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
