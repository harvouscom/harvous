/**
 * Subscription utilities — Drizzle port of src/utils/subscription.ts
 *
 * Note creation is unlimited for all users. `hasUnlimited` still reflects Clerk
 * `unlimited_notes` (used for shared-space tier and billing UI). `limit` is
 * always null for notes.
 */

import { db, first, UserMetadata, Notes, eq, and, isNotNull, desc } from '../db';
import type { Auth } from '../middleware/types';

export const UNLIMITED_PLAN_ID = process.env.CLERK_UNLIMITED_PLAN_ID || 'cplan_37aJweoipC2wY2Pa94o7zMdoIyw';

export async function getUserNoteCount(userId: string): Promise<number> {
  try {
    const [userMetadata, existingNotes] = await Promise.all([
      db
        .select({ highestSimpleNoteId: UserMetadata.highestSimpleNoteId })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .limit(1)
        .then(rows => first(rows)),
      db
        .select({ simpleNoteId: Notes.simpleNoteId })
        .from(Notes)
        .where(and(eq(Notes.userId, userId), isNotNull(Notes.simpleNoteId)))
        .orderBy(desc(Notes.simpleNoteId))
        .limit(1),
    ]);
    const fromMetadata = userMetadata?.highestSimpleNoteId ?? 0;
    const maxFromNotes = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId ?? 0) : 0;
    return Math.max(fromMetadata, maxFromNotes);
  } catch (error) {
    console.error('Error getting user note count:', error);
    return 0;
  }
}

export async function getReferralBonusNotes(userId: string): Promise<number> {
  try {
    const row = first(await db
      .select({ referralBonusNotes: UserMetadata.referralBonusNotes })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1));
    return row?.referralBonusNotes ?? 0;
  } catch (error) {
    console.error('Error getting referral bonus notes:', error);
    return 0;
  }
}

export function hasUnlimitedNotes(auth: Auth): boolean {
  return auth.has({ feature: 'unlimited_notes' });
}

/** All users may create notes; kept for call sites that expect this shape. */
export async function canCreateNote(
  _userId: string,
  _auth: Auth
): Promise<{
  allowed: boolean;
  reason?: string;
  currentCount?: number;
  limit?: number;
  upgradeUrl?: string;
}> {
  return { allowed: true };
}

export async function getSubscriptionInfo(userId: string, auth: Auth) {
  const hasUnlimited = hasUnlimitedNotes(auth);
  const [currentCount, referralBonusNotes] = await Promise.all([
    getUserNoteCount(userId),
    getReferralBonusNotes(userId),
  ]);

  return {
    hasUnlimited,
    currentCount,
    limit: null as number | null,
    referralBonusNotes,
  };
}
