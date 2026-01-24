import type { APIRoute } from 'astro';
import { getSubscriptionInfo } from '@/utils/subscription';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals  }) => {
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
      return new Response(JSON.stringify({
        error: 'Authentication required'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const subscriptionInfo = await getSubscriptionInfo(userId);

    return new Response(JSON.stringify({
      hasUnlimited: subscriptionInfo.hasUnlimited,
      currentCount: subscriptionInfo.currentCount,
      limit: subscriptionInfo.limit
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error checking subscription status:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to check subscription status',
      hasUnlimited: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

