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
import { nowISO } from '../db/dates';
import { ClerkUserMapping } from '../db/schema';
import { mergeDevUserIntoLive } from '../utils/merge-user-into-live';
import type { Auth } from './types';

/**
 * Public API routes that do not require authentication.
 * Mirrors the list in src/middleware.ts (lines 16-34).
 */
const PUBLIC_PREFIXES = [
  '/api/shared/',
  '/api/og/',
  '/api/webflow/',
  '/api/migrations/',
  '/api/test/',
];

const PUBLIC_EXACT = [
  '/api/health',
  '/api/webhooks/clerk',
  '/api/stats/user-count',
];

function isPublicRoute(path: string): boolean {
  if (PUBLIC_EXACT.includes(path)) return true;
  return PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix));
}

const NULL_AUTH: Auth = {
  userId: null,
  has: () => false,
};

/**
 * Extract the __session cookie value from the Cookie header.
 * Clerk stores the session JWT in the __session cookie.
 */
function getSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/);
  return match ? match[1] : null;
}

type ResolvedMapping = { devUserId: string; migratedToLiveAt: string | null };

/**
 * Resolve Clerk Production (live) user ID: if we have a mapping to a dev user
 * and have not yet migrated, we merge dev→live and then use live ID from then on.
 * Returns the mapping row if found, else null.
 */
async function resolveLiveToDevMapping(liveUserId: string, secretKey: string): Promise<ResolvedMapping | null> {
  try {
    const db = getDb();
    const byLive = await db
      .select({
        devUserId: ClerkUserMapping.devUserId,
        migratedToLiveAt: ClerkUserMapping.migratedToLiveAt,
      })
      .from(ClerkUserMapping)
      .where(eq(ClerkUserMapping.liveUserId, liveUserId))
      .get();
    if (byLive) return { devUserId: byLive.devUserId, migratedToLiveAt: byLive.migratedToLiveAt };

    const clerk = createClerkClient({ secretKey });
    const user = await clerk.users.getUser(liveUserId);
    const primaryEmail = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId);
    const email = primaryEmail?.emailAddress;
    if (!email) return null;
    const normalized = email.trim().toLowerCase();

    const byEmail = await db
      .select({
        devUserId: ClerkUserMapping.devUserId,
        migratedToLiveAt: ClerkUserMapping.migratedToLiveAt,
      })
      .from(ClerkUserMapping)
      .where(eq(ClerkUserMapping.email, normalized))
      .get();
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
export async function clerkAuth(c: Context, next: Next) {
  // Public routes get null auth (handlers can still check auth if they want)
  if (isPublicRoute(c.req.path)) {
    c.set('auth', NULL_AUTH);
    return next();
  }

  const sessionToken = getSessionToken(c.req.header('Cookie'));
  const bearerToken = c.req.header('Authorization')?.replace('Bearer ', '');
  const token = sessionToken || bearerToken;

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
    const payload = await verifyToken(token, { secretKey });

    let userId = payload.sub;
    const mapping = await resolveLiveToDevMapping(userId, secretKey);
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
      has: (check: { feature: string }) => {
        // Clerk encodes features in the token's "fea" claim (comma-separated)
        const fea = (payload as any).fea;
        if (!fea) return false;
        if (typeof fea === 'string') {
          return fea.split(',').includes(check.feature);
        }
        if (Array.isArray(fea)) {
          return fea.includes(check.feature);
        }
        return false;
      },
    };

    c.set('auth', auth);
  } catch (err) {
    // Token verification failed — treat as unauthenticated
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
