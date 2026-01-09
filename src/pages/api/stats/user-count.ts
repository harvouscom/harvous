import type { APIRoute } from 'astro';
import { createClerkClient } from '@clerk/backend';

/**
 * Public API endpoint that returns the total user count from Clerk.
 * 
 * This endpoint:
 * - Fetches user count from Clerk API
 * - Returns a simple JSON response with the count
 * - Is publicly accessible (no auth required) for use in Webflow
 * - Includes caching headers to reduce API calls
 * - Allows CORS requests from www.harvous.com
 * 
 * Response format: { count: number }
 */
export const GET: APIRoute = async () => {
  // CORS headers to allow requests from Webflow site
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://www.harvous.com',
    'Access-Control-Allow-Methods': 'GET',
  };

  try {
    const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
    
    if (!clerkSecretKey) {
      console.error('[user-count] CLERK_SECRET_KEY not configured');
      return new Response(JSON.stringify({ 
        count: 0,
        error: 'Service unavailable'
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          ...corsHeaders
        }
      });
    }

    const clerkClient = createClerkClient({
      secretKey: clerkSecretKey,
    });

    // Fetch first page to get totalCount (efficient - don't need actual user data)
    const { totalCount } = await clerkClient.users.getUserList({
      limit: 1,
      offset: 0,
    });

    return new Response(JSON.stringify({ 
      count: totalCount || 0
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 5 minutes - user count doesn't change frequently
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        ...corsHeaders
      }
    });

  } catch (error: any) {
    console.error('[user-count] Error fetching user count:', error);
    
    return new Response(JSON.stringify({ 
      count: 0,
      error: 'Failed to fetch user count'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...corsHeaders
      }
    });
  }
};
