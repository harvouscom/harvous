/**
 * Self-Hosted Authentication Utility
 * 
 * Provides a constant userId for self-hosted mode (no authentication required)
 */

const SELF_HOSTED_USER_ID = 'self-hosted';

/**
 * Check if we're running in self-hosted mode
 */
export function isSelfHosted(): boolean {
  return import.meta.env.SELF_HOSTED === 'true';
}

/**
 * Get the current user ID
 * - In self-hosted mode: returns constant 'self-hosted'
 * - In SaaS mode: should use Clerk's auth (this is a fallback)
 */
export function getSelfHostedUserId(): string {
  return SELF_HOSTED_USER_ID;
}

/**
 * Get user ID from auth context or self-hosted mode
 * Use this in API routes and pages instead of locals.auth()
 */
export function getUserId(auth?: { userId?: string | null }): string {
  if (isSelfHosted()) {
    return SELF_HOSTED_USER_ID;
  }
  
  // In SaaS mode, require auth
  if (!auth?.userId) {
    throw new Error('User ID is required but not found');
  }
  
  return auth.userId;
}

