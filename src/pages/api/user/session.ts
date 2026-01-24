import type { APIRoute } from 'astro';
import { awardSessionXP } from '@/utils/xp-system';
import { calculateSessionXP, type SessionData } from '@/utils/session-tracker';
import { handleAPIError } from '@/utils/error-handling';
import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
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

    // Get session data from request body
    const body = await request.json();
    const { activities, startTime, lastActivityTime } = body;

    if (!activities || !Array.isArray(activities)) {
      return new Response(JSON.stringify({ error: 'Invalid session data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Reconstruct session data
    const sessionData: SessionData = {
      userId,
      startTime: new Date(startTime),
      activities: activities.map((a: any) => ({
        actionType: a.actionType,
        timestamp: new Date(a.timestamp),
        relatedId: a.relatedId || undefined
      })),
      lastActivityTime: new Date(lastActivityTime)
    };

    // Calculate session XP
    const sessionXP = calculateSessionXP(sessionData);

    if (sessionXP === 0) {
      return new Response(JSON.stringify({
        success: true,
        awardedXP: 0,
        message: 'Session did not meet minimum requirements'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Award XP
    const awarded = await awardSessionXP(userId, sessionXP);

    return new Response(JSON.stringify({
      success: true,
      awardedXP: awarded ? sessionXP : 0,
      message: awarded ? 'Session XP awarded' : 'Daily session cap reached'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/session',
      action: 'end_session'
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

