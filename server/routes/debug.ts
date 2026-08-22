/**
 * Debug routes.
 * - GET /api/debug/request-headers — dev-only, request headers.
 * - GET /api/debug/me — auth + DB counts for current user (safe to use in prod to verify userId vs Turso).
 * - GET /api/debug/auth-config — which Clerk instance this host is configured against.
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
import { db, first, Threads, Spaces, Notes, eq, and, isNull, count, sql } from '../db';

const route = new Hono();

/**
 * GET /api/debug/auth-config — is this host on Clerk's live or test instance?
 *
 * Exists because answering that previously required a real `__session` cookie,
 * and a session cookie is a live credential — checking a config value should
 * not mean handling one. A host running a test key while the SPA issues live
 * tokens rejects every session, which is how a cutover once reached production
 * green on health checks and broken for every signed-in user.
 *
 * Reports the key's MODE only, never the key. "live"/"test" is derived from the
 * documented sk_live_/sk_test_ prefix and tells an attacker nothing they could
 * not infer from whether their own login works.
 */
route.get('/api/debug/auth-config', (c) => {
  const key = process.env.CLERK_SECRET_KEY?.trim() ?? '';
  const mode = key.startsWith('sk_live_')
    ? 'live'
    : key.startsWith('sk_test_')
      ? 'test'
      : key
        ? 'unrecognized'
        : 'unset';

  return c.json(
    {
      clerkMode: mode,
      // Distinguishes "this host" from whatever is proxying to it.
      host: process.env.FLY_APP_NAME ? 'fly' : process.env.NETLIFY ? 'netlify' : 'other',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
});

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
    const [threadCountRow, spaceCountRow, noteCountRow, nullSpaceIdNoteCountRow, myHomeSpaceRow] = await Promise.all([
      db.select({ count: count() }).from(Threads).where(eq(Threads.userId, auth.userId)).limit(1).then(r => first(r)),
      db.select({ count: count() }).from(Spaces).where(eq(Spaces.userId, auth.userId)).limit(1).then(r => first(r)),
      db.select({ count: count() }).from(Notes).where(eq(Notes.userId, auth.userId)).limit(1).then(r => first(r)),
      db
        .select({ count: count() })
        .from(Notes)
        .where(and(eq(Notes.userId, auth.userId), isNull(Notes.spaceId)))
        .limit(1)
        .then((r) => first(r)),
      db
        .select({ id: Spaces.id })
        .from(Spaces)
        .where(and(eq(Spaces.userId, auth.userId), sql`lower(trim(${Spaces.title})) = 'my home'`))
        .limit(1)
        .then((r) => first(r)),
    ]);
    const myHomeSpaceId = myHomeSpaceRow?.id ?? null;
    const myHomeNoteCountRow = myHomeSpaceId
      ? first(
          await db
            .select({ count: count() })
            .from(Notes)
            .where(and(eq(Notes.userId, auth.userId), eq(Notes.spaceId, myHomeSpaceId)))
            .limit(1),
        )
      : null;
    return c.json(
      {
        hasUserId: true,
        userIdPrefix: auth.userId.slice(0, 12),
        threadCount: threadCountRow?.count ?? 0,
        spaceCount: spaceCountRow?.count ?? 0,
        noteCount: noteCountRow?.count ?? 0,
        nullSpaceIdNoteCount: nullSpaceIdNoteCountRow?.count ?? 0,
        myHomeSpaceId,
        myHomeNoteCount: myHomeNoteCountRow?.count ?? 0,
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
