import type { APIRoute } from 'astro';
import { getSubscriptionInfo } from '@/utils/subscription';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const auth = locals.auth();
    const { userId } = auth;
    
    if (!userId) {
      return new Response(JSON.stringify({ 
        error: 'Authentication required' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const subscriptionInfo = await getSubscriptionInfo(userId, auth);

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

