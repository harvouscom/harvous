import type { APIRoute } from 'astro';
import { getSubscriptionInfo } from '@/utils/subscription';
import { getAuthFromRequest } from '@/utils/auth-helpers';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals  }) => {
  try {
    const userId = await getAuthFromRequest(request);

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

