/**
 * Clerk authentication middleware for Hono.
 *
 * Replaces the Astro middleware at src/middleware.ts.
 * Verifies the __session cookie using @clerk/backend and sets
 * `c.var.auth` with { userId, has } for use in route handlers.
 */

import { verifyToken } from '@clerk/backend';
import type { Context, Next } from 'hono';
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

    const auth: Auth = {
      userId: payload.sub,
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
