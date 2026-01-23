import type { APIRoute } from 'astro';
import { handleAPIError } from '@/utils/error-handling';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
    }

    // Cancel subscription using Clerk Billing API
    try {
      const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
      
      if (!clerkSecretKey) {
        return new Response(JSON.stringify({ 
          error: 'Clerk secret key not configured'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // First, get the user's subscription to find the subscription ID
      // Try to get user's billing subscriptions
      let subscriptionId: string | null = null;
      
      // Try to get subscriptions from user billing endpoint
      const subscriptionsResponse = await fetch(`https://api.clerk.com/v1/users/${userId}/billing/subscriptions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${clerkSecretKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (subscriptionsResponse.ok) {
        const subscriptionsData = await subscriptionsResponse.json();
        // Find active subscription
        const activeSubscription = Array.isArray(subscriptionsData) 
          ? subscriptionsData.find((sub: any) => sub.status === 'active' || sub.status === 'trialing')
          : subscriptionsData.data?.find((sub: any) => sub.status === 'active' || sub.status === 'trialing');
        
        if (activeSubscription) {
          subscriptionId = activeSubscription.id || activeSubscription.subscription_id;
        }
      }

      // If we found a subscription ID, cancel it
      if (subscriptionId) {
        // Try to cancel the subscription
        // Clerk Billing API might use DELETE or PATCH with cancel_at_period_end
        const cancelResponse = await fetch(`https://api.clerk.com/v1/users/${userId}/billing/subscriptions/${subscriptionId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (cancelResponse.ok) {
          return new Response(JSON.stringify({
            success: true,
            message: 'Subscription canceled successfully'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // If DELETE doesn't work, try PATCH to cancel at period end
        const patchResponse = await fetch(`https://api.clerk.com/v1/users/${userId}/billing/subscriptions/${subscriptionId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            cancel_at_period_end: true
          })
        });

        if (patchResponse.ok) {
          return new Response(JSON.stringify({
            success: true,
            message: 'Subscription will be canceled at the end of the billing period'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // If both fail, return error
        const errorText = await patchResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || `HTTP ${patchResponse.status} ${patchResponse.statusText}` };
        }

        console.error('Clerk Billing API error canceling subscription:', {
          status: patchResponse.status,
          statusText: patchResponse.statusText,
          error: errorData,
          subscriptionId
        });

        return new Response(JSON.stringify({ 
          error: 'Failed to cancel subscription',
          details: errorData.message || errorData.error || `HTTP ${patchResponse.status} ${patchResponse.statusText}`,
          statusCode: patchResponse.status
        }), {
          status: patchResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // No active subscription found
        return new Response(JSON.stringify({ 
          error: 'No active subscription found',
          message: 'You do not have an active subscription to cancel'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (billingError: any) {
      console.error('Clerk Billing API error:', billingError);
      
      return new Response(JSON.stringify({ 
        error: 'Error canceling subscription',
        details: billingError.message,
        hint: 'Please verify Clerk Billing is properly configured and the API endpoint exists.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/billing/downgrade',
      action: 'cancel_subscription'
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

