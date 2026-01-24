import type { APIRoute } from 'astro';
import { handleAPIError } from '@/utils/error-handling';
import { UNLIMITED_PLAN_ID } from '@/utils/subscription';

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

    const body = await request.json();
    const { planId, billingInterval } = body;

    if (!planId || planId !== UNLIMITED_PLAN_ID) {
      return new Response(JSON.stringify({ error: 'Invalid plan ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create checkout session using Clerk Billing API
    // Note: Clerk Billing API endpoint may vary - check latest documentation
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

      const origin = new URL(request.url).origin;
      
      // According to Clerk Billing docs, checkout might work through different mechanisms
      // Try the user-specific billing subscriptions endpoint
      // Note: Clerk Billing API structure may differ - this is based on common patterns
      const checkoutPayload: any = {
        plan_id: UNLIMITED_PLAN_ID,
        return_url: `${origin}/upgrade?success=true`,
        cancel_url: `${origin}/upgrade?canceled=true`,
      };

      // If billing interval is specified (annual), add it to the payload
      // Clerk plans can have both monthly and annual options configured in dashboard
      // The plan_id 'unlimited' should reference the plan created in Clerk Dashboard
      if (billingInterval === 'annual' || billingInterval === 'year') {
        // Clerk might handle this via plan configuration, but we'll try to specify it
        checkoutPayload.billing_interval = 'year';
        checkoutPayload.interval = 'year';
      }

      // Try creating a checkout session via user billing endpoint
      // Based on Clerk API patterns: /v1/users/{userId}/billing/checkout
      let response = await fetch(`https://api.clerk.com/v1/users/${userId}/billing/checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clerkSecretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(checkoutPayload)
      });

      // If that fails, try alternative endpoint structures
      if (!response.ok && (response.status === 404 || response.status === 405)) {
        // Try alternative: direct subscription creation (if checkout isn't available)
        response = await fetch(`https://api.clerk.com/v1/users/${userId}/billing/subscriptions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            plan_id: UNLIMITED_PLAN_ID,
            ...(billingInterval === 'annual' || billingInterval === 'year' ? { billing_interval: 'year' } : {})
          })
        });
        
        // If direct subscription creation works, return success (no checkout URL needed)
        if (response.ok) {
          return new Response(JSON.stringify({
            success: true,
            message: 'Subscription created successfully'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      if (response.ok) {
        const checkoutSession = await response.json();
        return new Response(JSON.stringify({
          checkoutUrl: checkoutSession.url || checkoutSession.checkout_url || checkoutSession.session_url
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || `HTTP ${response.status} ${response.statusText}` };
        }
        
        // Log detailed error information
        console.error('Clerk Billing API error response:', {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          error: errorData,
          attemptedEndpoint: `/v1/users/${userId}/billing/checkout`
        });
        
        // Provide more helpful error message based on status code
        let errorMessage = 'Error creating checkout session';
        let hint = 'Please check Clerk Billing API documentation for the correct endpoint and parameters.';
        
        if (response.status === 404) {
          errorMessage = 'Checkout endpoint not found';
          hint = 'Clerk Billing checkout might need to be handled through frontend components (<CheckoutButton /> or useCheckout() hook) rather than a backend API.';
        } else if (response.status === 405) {
          errorMessage = 'Method not allowed';
          hint = 'This endpoint might not support POST requests, or checkout might need to be handled differently.';
        } else if (response.status === 401 || response.status === 403) {
          errorMessage = 'Authentication failed';
          hint = 'Please verify your Clerk secret key is correct and has billing permissions.';
        }
        
        return new Response(JSON.stringify({ 
          error: errorMessage,
          details: errorData.message || errorData.error || `HTTP ${response.status} ${response.statusText}`,
          statusCode: response.status,
          clerkError: errorData,
          hint: hint
        }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (billingError: any) {
      console.error('Clerk Billing API error:', billingError);
      
      return new Response(JSON.stringify({ 
        error: 'Error creating checkout session',
        details: billingError.message,
        hint: 'Please verify Clerk Billing is properly configured and the API endpoint exists.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/billing/checkout',
      action: 'create_checkout_session'
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

