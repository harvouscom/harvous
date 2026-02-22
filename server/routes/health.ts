/**
 * GET /api/health
 *
 * Lightweight health check endpoint for warming up serverless functions.
 * Returns immediately without database queries.
 *
 * Port of: src/pages/api/health.ts
 */

import { Hono } from 'hono';

const route = new Hono();

route.get('/api/health', (c) => {
  return c.json(
    { status: 'ok', timestamp: Date.now() },
    200,
    { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  );
});

export default route;
