/**
 * Subscription utilities — Drizzle port of src/utils/subscription.ts
 */

import { db, UserMetadata, eq } from '../db';
import type { Auth } from '../middleware/types';

const FREE_TIER_LIMIT = 200;
export const UNLIMITED_PLAN_ID = process.env.CLERK_UNLIMITED_PLAN_ID || 'cplan_37aJweoipC2wY2Pa94o7zMdoIyw';

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
    return 0;
  }
}

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

export function hasUnlimitedNotes(auth: Auth): boolean {
  return auth.has({ feature: 'unlimited_notes' });
}

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
    const hasUnlimited = hasUnlimitedNotes(auth);
    if (hasUnlimited) {
      return { allowed: true };
    }

    const [noteCount, referralBonusNotes] = await Promise.all([
      getUserNoteCount(userId),
      getReferralBonusNotes(userId),
    ]);
    const effectiveLimit = FREE_TIER_LIMIT + referralBonusNotes;

    if (noteCount >= effectiveLimit) {
      return {
        allowed: false,
        reason: `You've used all ${effectiveLimit} notes. Upgrade for unlimited.`,
        currentCount: noteCount,
        limit: effectiveLimit,
        upgradeUrl: '/upgrade',
      };
    }

    return {
      allowed: true,
      currentCount: noteCount,
      limit: effectiveLimit,
    };
  } catch (error) {
    console.error('Error checking if user can create note:', error);
    return { allowed: true };
  }
}

export async function getSubscriptionInfo(userId: string, auth: Auth) {
  const hasUnlimited = hasUnlimitedNotes(auth);
  const [currentCount, referralBonusNotes] = await Promise.all([
    getUserNoteCount(userId),
    getReferralBonusNotes(userId),
  ]);
  const effectiveLimit = FREE_TIER_LIMIT + referralBonusNotes;

  return {
    hasUnlimited,
    currentCount,
    limit: hasUnlimited ? null : effectiveLimit,
    referralBonusNotes,
  };
}
