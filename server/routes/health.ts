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

const route = new Hono();

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
