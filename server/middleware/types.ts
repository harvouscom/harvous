/**
 * Auth types for the Hono API layer.
 *
 * Replaces `import type { Auth } from '@clerk/astro/server'`
 * with a minimal interface matching the subset we actually use.
 */

export interface Auth {
  userId: string | null;
  /** Check if the user has a specific Clerk feature (e.g., 'unlimited_notes'). */
  has: (check: { feature: string }) => boolean;
}

/**
 * Hono context variables set by the auth middleware.
 * Use with: `c.get('auth')` to access in route handlers.
 */
export type HonoVariables = {
  auth: Auth;
};
