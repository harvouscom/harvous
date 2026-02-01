import { db, UserMetadata, eq } from 'astro:db';
import type { Auth } from '@clerk/astro/server';

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
 * Get referral bonus notes for a user (bonus note allowance from successful referrals).
 */
export async function getReferralBonusNotes(userId: string): Promise<number> {
  try {
    const row = await db
      .select({ referralBonusNotes: UserMetadata.referralBonusNotes })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();
    return row?.referralBonusNotes ?? 0;
  } catch (error) {
    console.error('Error getting referral bonus notes:', error);
    return 0;
  }
}

/**
 * Check if user has active "unlimited_notes" feature via Clerk Billing Features
 * Uses Clerk's recommended has() method - auth object already contains user context
 */
export function hasUnlimitedNotes(auth: Auth): boolean {
  return auth.has({ feature: 'unlimited_notes' });
}

/**
 * Check if user can create a new note
 * Returns object with allowed status, reason if not allowed, and current count/limit info
 */
export async function canCreateNote(
  userId: string,
  auth: Auth
): Promise<{ 
  allowed: boolean; 
  reason?: string; 
  currentCount?: number; 
  limit?: number;
  upgradeUrl?: string;
}> {
  try {
    // Check if user has unlimited plan
    const hasUnlimited = hasUnlimitedNotes(auth);
    
    if (hasUnlimited) {
      return { allowed: true };
    }

    // Free tier - check note count against effective limit (base + referral bonus)
    const [noteCount, referralBonusNotes] = await Promise.all([
      getUserNoteCount(userId),
      getReferralBonusNotes(userId)
    ]);
    const effectiveLimit = FREE_TIER_LIMIT + referralBonusNotes;

    if (noteCount >= effectiveLimit) {
      return {
        allowed: false,
        reason: 'Note limit reached',
        currentCount: noteCount,
        limit: effectiveLimit,
        upgradeUrl: '/upgrade'
      };
    }

    return {
      allowed: true,
      currentCount: noteCount,
      limit: effectiveLimit
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
export async function getSubscriptionInfo(userId: string, auth: Auth): Promise<{
  hasUnlimited: boolean;
  currentCount: number;
  limit: number | null; // null means unlimited
  referralBonusNotes?: number;
}> {
  const hasUnlimited = hasUnlimitedNotes(auth);
  const [currentCount, referralBonusNotes] = await Promise.all([
    getUserNoteCount(userId),
    getReferralBonusNotes(userId)
  ]);
  const effectiveLimit = FREE_TIER_LIMIT + referralBonusNotes;

  return {
    hasUnlimited,
    currentCount,
    limit: hasUnlimited ? null : effectiveLimit,
    referralBonusNotes
  };
}

