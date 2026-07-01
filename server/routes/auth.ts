/**
 * GET /api/auth/status
 *
 * Public session probe for the marketing site (harvous.com). Returns whether the
 * caller has a valid Clerk __session cookie — no user profile payload.
 * CORS + credentials for harvous.com only (no Clerk satellite domains required).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { getAuth } from '../middleware/auth';

const route = new Hono();

const MARKETING_ORIGINS = new Set([
  'https://harvous.com',
  'https://www.harvous.com',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
]);

function setMarketingCors(c: Context) {
  const origin = c.req.header('Origin');
  if (origin && MARKETING_ORIGINS.has(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
  }
}

route.options('/api/auth/status', (c) => {
  setMarketingCors(c);
  return c.body(null, 204);
});

route.get('/api/auth/status', (c) => {
  setMarketingCors(c);
  const auth = getAuth(c);
  return c.json(
    { signedIn: Boolean(auth.userId) },
    200,
    { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  );
});

export default route;
