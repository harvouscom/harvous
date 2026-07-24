/**
 * Subscription utilities — note stats + entitlement summary for the SPA.
 */

import { db, first, UserMetadata, Notes, Entitlements, eq, and, isNotNull, desc } from '../db';
import type { Auth } from '../middleware/types';
import {
  getTierForAuth,
  getSharedSpacesOwnedCount,
  hasSharedSpacesAddOn,
  FREE_OWNED_SHARED_SPACES_LIMIT,
} from './tier-limits';
import { getActiveEntitlements, limitsForUser } from './entitlements';
import { planForPriceId, type FeatureKey, type PlanKey } from '@/lib/billing-plans';

export async function getUserNoteCount(userId: string): Promise<number> {
  try {
    const [userMetadata, existingNotes] = await Promise.all([
      db
        .select({ highestSimpleNoteId: UserMetadata.highestSimpleNoteId })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .limit(1)
        .then((rows) => first(rows)),
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

/** @deprecated Retired tier — inert; notes are unlimited on every plan. */
export async function hasUnlimitedNotes(auth: Auth): Promise<boolean> {
  return (await getTierForAuth(auth)) === 'unlimited';
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

async function resolvePlanKey(userId: string): Promise<PlanKey | null> {
  const row = first(
    await db
      .select({ priceId: Entitlements.priceId })
      .from(Entitlements)
      .where(
        and(
          eq(Entitlements.userId, userId),
          eq(Entitlements.status, 'active'),
          eq(Entitlements.source, 'billing'),
        ),
      )
      .limit(1),
  );
  const plan = planForPriceId(row?.priceId);
  return plan?.key ?? null;
}

export async function getSubscriptionInfo(userId: string, auth: Auth) {
  const [
    hasUnlimited,
    hasSharedSpaces,
    currentCount,
    referralBonusNotes,
    sharedSpacesOwnedCount,
    entitlements,
    limits,
    planKey,
  ] = await Promise.all([
    hasUnlimitedNotes(auth),
    hasSharedSpacesAddOn(auth),
    getUserNoteCount(userId),
    getReferralBonusNotes(userId),
    getSharedSpacesOwnedCount(userId),
    getActiveEntitlements(userId),
    limitsForUser(userId),
    resolvePlanKey(userId),
  ]);

  const sharedSpacesOwnedLimit = hasSharedSpaces ? limits.ownedSpaces : FREE_OWNED_SHARED_SPACES_LIMIT;

  return {
    hasUnlimited,
    hasSharedSpaces,
    entitlements: entitlements as FeatureKey[],
    planKey,
    limits: {
      ownedSpaces: sharedSpacesOwnedLimit,
      membersPerSpace: limits.membersPerSpace,
    },
    currentCount,
    limit: null as number | null,
    referralBonusNotes,
    sharedSpacesOwnedCount,
    sharedSpacesOwnedLimit,
  };
}
