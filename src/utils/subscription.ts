import { db, UserMetadata, eq } from 'astro:db';
import type { Auth } from '@clerk/astro/server';
import { clerkClient } from '@clerk/astro/server';

const FREE_TIER_LIMIT = 1000;
// Clerk Billing plan ID for unlimited notes
// Use environment variable for production, fallback to dev plan ID for development
export const UNLIMITED_PLAN_ID = import.meta.env.CLERK_UNLIMITED_PLAN_ID || 'cplan_37aJweoipC2wY2Pa94o7zMdoIyw';

/**
 * Get user's note count from UserMetadata.highestSimpleNoteId
 * Since note IDs start at 1 and increment sequentially, highestSimpleNoteId equals total count
 */
export async function getUserNoteCount(userId: string): Promise<number> {
  try {
    const userMetadata = await db
      .select({ highestSimpleNoteId: UserMetadata.highestSimpleNoteId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    return userMetadata?.highestSimpleNoteId || 0;
  } catch (error) {
    console.error('Error getting user note count:', error);
    return 0; // Fail safe - return 0 if error
  }
}

/**
 * Check if user has active "unlimited_notes" feature via Clerk Billing
 * For static builds with JWT auth, check via Clerk client API
 * For SSR builds, check via auth.has() if available
 */
export async function hasUnlimitedNotes(userId: string, auth?: Auth): Promise<boolean> {
  // Try server-side auth.has() first (SSR/middleware builds)
  if (auth && typeof auth.has === 'function') {
    return auth.has({ feature: 'unlimited_notes' });
  }

  // Fallback: check via Clerk client API (static builds with JWT)
  try {
    const user = await clerkClient.users.getUser(userId);
    // Check if user has unlimited_notes feature in their subscription
    // This checks the organization features or user metadata
    return user.publicMetadata?.unlimited_notes === true || false;
  } catch (error) {
    console.error('Error checking unlimited notes:', error);
    return false; // Fail safe - assume no unlimited access
  }
}

/**
 * Check if user can create a new note
 * Returns object with allowed status, reason if not allowed, and current count/limit info
 */
export async function canCreateNote(
  userId: string,
  auth?: Auth
): Promise<{
  allowed: boolean;
  reason?: string;
  currentCount?: number;
  limit?: number;
  upgradeUrl?: string;
}> {
  try {
    // Check if user has unlimited plan
    const hasUnlimited = await hasUnlimitedNotes(userId, auth);

    if (hasUnlimited) {
      return { allowed: true };
    }

    // Free tier - check note count
    const noteCount = await getUserNoteCount(userId);

    if (noteCount >= FREE_TIER_LIMIT) {
      return {
        allowed: false,
        reason: 'Note limit reached',
        currentCount: noteCount,
        limit: FREE_TIER_LIMIT,
        upgradeUrl: '/upgrade'
      };
    }

    return {
      allowed: true,
      currentCount: noteCount,
      limit: FREE_TIER_LIMIT
    };
  } catch (error) {
    console.error('Error checking if user can create note:', error);
    // Fail open - allow note creation if check fails
    return { allowed: true };
  }
}

/**
 * Get subscription status and note limit info for display
 */
export async function getSubscriptionInfo(userId: string, auth?: Auth): Promise<{
  hasUnlimited: boolean;
  currentCount: number;
  limit: number | null; // null means unlimited
}> {
  const hasUnlimited = await hasUnlimitedNotes(userId, auth);
  const currentCount = await getUserNoteCount(userId);

  return {
    hasUnlimited,
    currentCount,
    limit: hasUnlimited ? null : FREE_TIER_LIMIT
  };
}

