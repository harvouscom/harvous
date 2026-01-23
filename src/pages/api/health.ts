import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Lightweight health check endpoint for warming up serverless functions.
 * 
 * This endpoint:
 * - Returns immediately without database queries
 * - Is called on visibility change to wake up cold functions
 * - Can be called in parallel with other warmup requests
 * 
 * Purpose: Reduce first-action delay after idle periods by pre-warming
 * the serverless function before the user takes action.
 */
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ 
    status: 'ok',
    timestamp: Date.now()
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
};

