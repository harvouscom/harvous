/**
 * Auth types for the Hono API layer.
 *
 * Replaces `import type { Auth } from '@clerk/astro/server'`
 * with a minimal interface matching the subset we actually use.
 */

export interface Auth {
  userId: string | null;
  /** Legacy Clerk feature check — always false; entitlements are DB-backed. */
  has: (check: { feature: string }) => boolean;
}

/** Auth with userId guaranteed to be non-null. Use after requireAuth middleware. */
export interface AuthenticatedAuth {
  userId: string;
  has: (check: { feature: string }) => boolean;
}

/**
 * Hono context variables set by the auth middleware.
 * Use with: `c.get('auth')` to access in route handlers.
 */
export type HonoVariables = {
  auth: Auth;
};
