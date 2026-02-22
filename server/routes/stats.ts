/**
 * GET /api/stats/user-count
 *
 * Public endpoint returning total user count from Clerk.
 * Used by the Webflow marketing site.
 *
 * Port of: src/pages/api/stats/user-count.ts
 */

import { Hono } from 'hono';
import { createClerkClient } from '@clerk/backend';

const route = new Hono();

route.get('/api/stats/user-count', async (c) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://www.harvous.com',
    'Access-Control-Allow-Methods': 'GET',
  };

  try {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;

    if (!clerkSecretKey) {
      console.error('[user-count] CLERK_SECRET_KEY not configured');
      return c.json(
        { count: 0, error: 'Service unavailable' },
        503,
        { 'Cache-Control': 'no-store, no-cache, must-revalidate', ...corsHeaders },
      );
    }

    const clerkClient = createClerkClient({ secretKey: clerkSecretKey });

    const { totalCount } = await clerkClient.users.getUserList({
      limit: 1,
      offset: 0,
    });

    return c.json(
      { count: totalCount || 0 },
      200,
      { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400', ...corsHeaders },
    );
  } catch (error: any) {
    console.error('[user-count] Error fetching user count:', error);

    return c.json(
      { count: 0, error: 'Failed to fetch user count' },
      500,
      { 'Cache-Control': 'no-store, no-cache, must-revalidate', ...corsHeaders },
    );
  }
});

export default route;
