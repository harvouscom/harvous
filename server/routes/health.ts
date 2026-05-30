/**
 * GET /api/health
 *
 * Lightweight health check endpoint for warming up serverless functions.
 * Default: no database. Use `?warm=db` to establish the Postgres pool (native / clients can prefetch on launch).
 *
 * Port of: src/pages/api/health.ts
 */

import { Hono } from 'hono';
import { warmPostgresConnection } from '../db/client';
import { votdTodayPublicHandler } from '../utils/votd-today-public';

const route = new Hono();

// Public VOTD metadata for native apps (same logic as featured carousel timezone rules).
route.get('/api/votd/today', votdTodayPublicHandler);

route.get('/api/health', async (c) => {
  if (c.req.query('warm') === 'db') {
    await warmPostgresConnection();
  }
  return c.json(
    { status: 'ok', timestamp: Date.now() },
    200,
    { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  );
});

export default route;
