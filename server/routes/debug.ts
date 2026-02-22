/**
 * GET /api/debug/request-headers
 *
 * Dev-only debug route to verify request headers (User-Agent).
 * Returns 404 in production.
 *
 * Port of: src/pages/api/debug/request-headers.ts
 */

import { Hono } from 'hono';

const route = new Hono();

route.get('/api/debug/request-headers', (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.body(null, 404);
  }

  const headers = c.req.raw.headers;
  const userAgent = headers.get('User-Agent') ?? headers.get('user-agent') ?? null;
  const xForwardedUserAgent = headers.get('x-forwarded-user-agent') ?? headers.get('X-Forwarded-User-Agent') ?? null;

  return c.json(
    {
      userAgent,
      userAgentLower: headers.get('user-agent') ?? null,
      xForwardedUserAgent,
      xForwardedUserAgentCaps: headers.get('X-Forwarded-User-Agent') ?? null,
      hasAnyUA: !!(userAgent || xForwardedUserAgent),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
});

export default route;
