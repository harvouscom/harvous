export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * Dev-only debug route to verify the request has User-Agent when it hits our app.
 * Used to diagnose "Unknown device" in Clerk: if UA is missing here, the problem
 * is on our side (request doesn't have it); if present, the patch should be passing it.
 * Returns 404 in production.
 */
export const GET: APIRoute = async ({ request }) => {
  if (import.meta.env.PROD) {
    return new Response(null, { status: 404 });
  }

  const headers = request.headers;
  const userAgent = headers.get('User-Agent') ?? headers.get('user-agent') ?? null;
  const xForwardedUserAgent = headers.get('x-forwarded-user-agent') ?? headers.get('X-Forwarded-User-Agent') ?? null;

  const body = {
    userAgent,
    userAgentLower: headers.get('user-agent') ?? null,
    xForwardedUserAgent,
    xForwardedUserAgentCaps: headers.get('X-Forwarded-User-Agent') ?? null,
    hasAnyUA: !!(userAgent || xForwardedUserAgent),
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
