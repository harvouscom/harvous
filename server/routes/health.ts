/**
 * GET /api/health
 *
 * Lightweight health check endpoint for warming up serverless functions.
 * Returns immediately without database queries.
 *
 * Port of: src/pages/api/health.ts
 */

import { Hono } from 'hono';
import { votdTodayPublicHandler } from '../utils/votd-today-public';

const route = new Hono();

// Public VOTD metadata for native apps (same timezone rules as `/api/featured/items` VOTD rows).
route.get('/api/votd/today', votdTodayPublicHandler);

route.get('/api/health', (c) => {
  return c.json(
    { status: 'ok', timestamp: Date.now() },
    200,
    { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  );
});

export default route;
