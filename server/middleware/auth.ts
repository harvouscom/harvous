/**
 * Clerk authentication middleware for Hono.
 *
 * Replaces the Astro middleware at src/middleware.ts.
 * Verifies the __session cookie using @clerk/backend and sets
 * `c.var.auth` with { userId, has } for use in route handlers.
 *
 * When ClerkUserMapping is populated (pk_live vs pk_test), resolves the live
 * user ID to the dev user ID so existing Turso data is visible without migration.
 */

import { createClerkClient, verifyToken } from '@clerk/backend';
import type { Context, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { first } from '../db/helpers';
import { nowISO } from '../db/dates';
import { ClerkUserMapping } from '../db/schema';
import { mergeDevUserIntoLive } from '../utils/merge-user-into-live';
import { HTTPException } from 'hono/http-exception';
import type { Auth, AuthenticatedAuth } from './types';

const NULL_AUTH: Auth = {
  userId: null,
  has: () => false,
};

const PRODUCTION_AUTHORIZED_PARTIES = ['https://app.harvous.com', 'https://new.harvous.com'] as const;

/** Origins allowed in JWT `azp` — mitigates subdomain cookie-leak attacks (Clerk production guide). */
function resolveAuthorizedParties(secretKey: string): string[] | undefined {
  const fromEnv = process.env.CLERK_AUTHORIZED_PARTIES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv?.length) return fromEnv;
  if (secretKey.startsWith('sk_live_')) return [...PRODUCTION_AUTHORIZED_PARTIES];
  return undefined;
}

/**
 * Extract the __session cookie value from the Cookie header.
 * Clerk stores the session JWT in the __session cookie.
 */
function getSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/);
  return match ? match[1] : null;
}

// migratedToLiveAt is a ts() column, so it reads back as a Date. Only ever tested for
// truthiness below, so the old `string | null` was wrong rather than harmful.
type ResolvedMapping = { devUserId: string; migratedToLiveAt: Date | null };

/**
 * Resolve Clerk Production (live) user ID: if we have a mapping to a dev user
 * and have not yet migrated, we merge dev→live and then use live ID from then on.
 * Returns the mapping row if found, else null.
 */
async function resolveLiveToDevMapping(liveUserId: string, secretKey: string): Promise<ResolvedMapping | null> {
  try {
    const db = getDb();
    const byLive = first(await db
      .select({
        devUserId: ClerkUserMapping.devUserId,
        migratedToLiveAt: ClerkUserMapping.migratedToLiveAt,
      })
      .from(ClerkUserMapping)
      .where(eq(ClerkUserMapping.liveUserId, liveUserId))
      .limit(1));
    if (byLive) return { devUserId: byLive.devUserId, migratedToLiveAt: byLive.migratedToLiveAt };

    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(liveUserId);
    const primaryEmail = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId);
    const email = primaryEmail?.emailAddress;
    if (!email) return null;
    const normalized = email.trim().toLowerCase();

    const byEmail = first(await db
      .select({
        devUserId: ClerkUserMapping.devUserId,
        migratedToLiveAt: ClerkUserMapping.migratedToLiveAt,
      })
      .from(ClerkUserMapping)
      .where(eq(ClerkUserMapping.email, normalized))
      .limit(1));
    if (!byEmail) return null;

    await db
      .update(ClerkUserMapping)
      .set({ liveUserId })
      .where(eq(ClerkUserMapping.devUserId, byEmail.devUserId));
    return { devUserId: byEmail.devUserId, migratedToLiveAt: byEmail.migratedToLiveAt };
  } catch {
    return null;
  }
}

/**
 * Clerk auth middleware for Hono.
 * Sets c.set('auth', { userId, has }) on every request.
 */
function parseBearerSecret(authorizationHeader: string | undefined): string | null {
  // Netlify's proxy can duplicate the Authorization header, producing
  // "Bearer <token>, Bearer <token>".  Take only the first value.
  const first = (authorizationHeader ?? '').split(',')[0].trim();
  const m = first.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

export async function clerkAuth(c: Context, next: Next) {
  const sessionToken = getSessionToken(c.req.header('Cookie'));
  const authHeader = c.req.header('Authorization') ?? c.req.header('authorization');
  const bearerSecret = parseBearerSecret(authHeader);

  // VOTD cron (and similar): Bearer value is a shared secret, not a Clerk JWT — do not verifyToken.
  const votdCronSecret = process.env.VOTD_CRON_SECRET?.trim();
  const pushReminderCronSecret = process.env.PUSH_REMINDER_CRON_SECRET?.trim();
  const cronSecrets = [votdCronSecret, pushReminderCronSecret].filter(
    (secret): secret is string => Boolean(secret),
  );
  if (bearerSecret && cronSecrets.includes(bearerSecret)) {
    c.set('auth', NULL_AUTH);
    c.set('cronAuthed', true);
    return next();
  }

  const token = sessionToken || bearerSecret;

  if (!token) {
    c.set('auth', NULL_AUTH);
    return next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('[auth] Missing CLERK_SECRET_KEY');
    c.set('auth', NULL_AUTH);
    return next();
  }

  try {
    const authorizedParties = resolveAuthorizedParties(secretKey);
    const payload = await verifyToken(token, {
      secretKey,
      ...(authorizedParties ? { authorizedParties } : {}),
    });

    let userId = payload.sub;
    // Only resolve live→dev mapping in production (live Clerk key).
    // In dev (sk_test_*) both accounts share the same test instance; running
    // the mapping would incorrectly merge one test user's data into another.
    const isLiveKey = secretKey.startsWith('sk_live_');
    const mapping = isLiveKey ? await resolveLiveToDevMapping(userId, secretKey) : null;
    if (mapping) {
      if (mapping.migratedToLiveAt) {
        userId = payload.sub;
      } else {
        await mergeDevUserIntoLive(mapping.devUserId, payload.sub);
        const db = getDb();
        await db
          .update(ClerkUserMapping)
          .set({ migratedToLiveAt: nowISO() })
          .where(eq(ClerkUserMapping.devUserId, mapping.devUserId));
        userId = payload.sub;
      }
    }

    const auth: Auth = {
      userId,
      // Entitlements are DB-backed (Polar billing); JWT feature claims are unused.
      has: () => false,
    };

    c.set('auth', auth);
  } catch (err) {
    // Token verification failed — treat as unauthenticated.
    //
    // Log the reason. This was silent, and a silent verification failure is
    // indistinguishable from "no cookie sent" and from "wrong Clerk key": all
    // three produce 401 on every route with nothing in the logs. Two failed
    // cutovers were misdiagnosed for exactly that reason. The reason string is
    // Clerk's own (expired, wrong azp, bad signature); the token is never logged.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('[auth] token verification failed:', reason);
    c.set('auth', NULL_AUTH);
  }

  return next();
}

/**
 * Helper to get auth from the Hono context.
 * Use in route handlers: `const auth = getAuth(c);`
 */
export function getAuth(c: Context): Auth {
  return c.get('auth') as Auth;
}

/**
 * Middleware that requires a valid userId.
 * Returns 401 if not authenticated. Use as route-level middleware:
 *
 *   route.post('/api/notes/create', requireAuth, async (c) => { ... });
 */
export async function requireAuth(c: Context, next: Next) {
  const auth = getAuth(c);
  if (!auth.userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  return next();
}

/**
 * Get auth with userId guaranteed to be string.
 * Use ONLY in route handlers that have requireAuth middleware.
 */
export function getAuthenticatedAuth(c: Context): AuthenticatedAuth {
  const auth = getAuth(c);
  if (!auth.userId) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }
  return auth as AuthenticatedAuth;
}

/**
 * Extract a required URL param, returning 400 if missing.
 */
export function requireParam(c: Context, name: string): string {
  const value = c.req.param(name as never);
  if (!value) {
    throw new HTTPException(400, { message: `Missing required parameter: ${name}` });
  }
  return value;
}

/**
 * Extract a required query param, returning 400 if missing.
 */
export function requireQuery(c: Context, name: string): string {
  const value = c.req.query(name);
  if (!value) {
    throw new HTTPException(400, { message: `Missing required query parameter: ${name}` });
  }
  return value;
}
