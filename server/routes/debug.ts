/**
 * Debug routes.
 * - GET /api/debug/request-headers — dev-only, request headers.
 * - GET /api/debug/me — auth + DB counts for current user (safe to use in prod to verify userId vs Turso).
 * - GET /api/debug/auth-config — which Clerk instance this host is configured against.
 */

import { Hono } from 'hono';
import { verifyToken } from '@clerk/backend';
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

  // Whether the request ARRIVED with a session cookie, which is separate from
  // whether that cookie is valid. A proxy that drops the Cookie header makes
  // every request anonymous no matter which Clerk key is loaded — the same 401
  // on every route, indistinguishable from a wrong key until you look here.
  const cookieHeader = c.req.header('Cookie') ?? '';
  const authHeader = c.req.header('Authorization') ?? '';

  return c.json(
    {
      clerkMode: mode,
      // Distinguishes "this host" from whatever is proxying to it.
      host: process.env.FLY_APP_NAME ? 'fly' : process.env.NETLIFY ? 'netlify' : 'other',
      receivedCookieHeader: cookieHeader.length > 0,
      receivedSessionCookie: /(?:^|;\s*)__session=/.test(cookieHeader),
      receivedAuthorizationHeader: authHeader.length > 0,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
});

/**
 * GET /api/debug/verify-session — why did this request's session fail?
 *
 * Open in a signed-in browser and it verifies whatever `__session` cookie the
 * request carries, reporting Clerk's own failure reason. The token is never
 * echoed, logged, or returned — only the outcome and, on success, the user id
 * prefix.
 *
 * This exists because auth failures are otherwise a single undifferentiated
 * 401: no cookie, wrong Clerk instance, expired token and rejected `azp` all
 * look identical from outside, and two cutovers were misdiagnosed as a result.
 *
 * TEMPORARY — remove once the Fly cutover is settled.
 */
route.get('/api/debug/verify-session', async (c) => {
  const cookieHeader = c.req.header('Cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/);
  const secretKey = process.env.CLERK_SECRET_KEY?.trim() ?? '';

  const base = {
    host: process.env.FLY_APP_NAME ? 'fly' : process.env.NETLIFY ? 'netlify' : 'other',
    clerkMode: secretKey.startsWith('sk_live_') ? 'live' : secretKey.startsWith('sk_test_') ? 'test' : 'unset',
    sessionCookiePresent: Boolean(match),
  };

  if (!match) {
    return c.json({ ...base, result: 'no-session-cookie' }, 200, { 'Cache-Control': 'no-store' });
  }
  if (!secretKey) {
    return c.json({ ...base, result: 'no-secret-key' }, 200, { 'Cache-Control': 'no-store' });
  }

  const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const payload = await verifyToken(match[1], {
      secretKey,
      ...(authorizedParties?.length ? { authorizedParties } : {}),
    });
    return c.json(
      { ...base, result: 'verified', userIdPrefix: String(payload.sub).slice(0, 12), azp: payload.azp ?? null },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return c.json(
      { ...base, result: 'verification-failed', reason: err instanceof Error ? err.message : String(err) },
      200,
      { 'Cache-Control': 'no-store' },
    );
  }
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
