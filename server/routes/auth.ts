/**
 * GET /api/auth/status
 *
 * Public session probe for the marketing site (harvous.com). Returns whether the
 * caller has a valid Clerk __session cookie — no user profile payload.
 * CORS + credentials configured in server/app.ts (not wildcard *).
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';

const route = new Hono();

route.get('/api/auth/status', (c) => {
  const auth = getAuth(c);
  return c.json(
    { signedIn: Boolean(auth.userId) },
    200,
    { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  );
});

export default route;
