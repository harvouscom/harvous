/**
 * Debug routes.
 * - GET /api/debug/request-headers — dev-only, request headers.
 * - GET /api/debug/me — auth + DB counts for current user (safe to use in prod to verify userId vs Turso).
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
import { db, Threads, Spaces, Notes } from '../db';
import { eq, count } from 'drizzle-orm';

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

/** GET /api/debug/me — hasUserId, userIdPrefix (first 12 chars), and DB counts for current user. Compare userIdPrefix with userId on rows in Turso. */
route.get('/api/debug/me', async (c) => {
  const auth = getAuth(c);
  if (!auth.userId) {
    return c.json({ hasUserId: false, message: 'Not authenticated' }, 200, { 'Cache-Control': 'no-store' });
  }
  try {
    const [threadCountRow, spaceCountRow, noteCountRow] = await Promise.all([
      db.select({ count: count() }).from(Threads).where(eq(Threads.userId, auth.userId)).get(),
      db.select({ count: count() }).from(Spaces).where(eq(Spaces.userId, auth.userId)).get(),
      db.select({ count: count() }).from(Notes).where(eq(Notes.userId, auth.userId)).get(),
    ]);
    return c.json(
      {
        hasUserId: true,
        userIdPrefix: auth.userId.slice(0, 12),
        threadCount: threadCountRow?.count ?? 0,
        spaceCount: spaceCountRow?.count ?? 0,
        noteCount: noteCountRow?.count ?? 0,
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ hasUserId: true, userIdPrefix: auth.userId.slice(0, 12), error: message }, 500, { 'Cache-Control': 'no-store' });
  }
});

export default route;
