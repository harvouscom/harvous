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
import {
  planForProductId,
  type FeatureKey,
  type PlanKey,
} from '@/lib/billing-plans';
import { getPolarBillingSummaries, type BillingSubscriptionSummary } from './polar-billing';

export type { BillingSubscriptionSummary };

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

/**
 * When this user claimed the founding offer, or null.
 *
 * Never cleared, so it survives cancellation and the first renewal onto the
 * list price — the badge is recognition, not an entitlement.
 */
export async function getFoundingClaimedAt(userId: string): Promise<Date | null> {
  try {
    const row = first(await db
      .select({ foundingClaimedAt: UserMetadata.foundingClaimedAt })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1));
    return row?.foundingClaimedAt ?? null;
  } catch (error) {
    console.error('Error getting founding claim:', error);
    return null;
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

/**
 * Read-only fallback for the *display* path (`getSubscriptionInfo`).
 *
 * That handler fans nine queries out through `Promise.all`, so one transient DB fault
 * rejected the whole thing and turned a Settings page load into a 500 — with the raw
 * Drizzle "Failed query: select …" text reaching the client. Every sibling read there
 * already degrades this way; these are the three that didn't.
 *
 * Gates (`canCreateSharedSpace`, `limitsForUser`) must NOT use this — they stay strict so a
 * blip can never fail open and let someone exceed a paid limit.
 */
async function softRead<T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    // Log the driver error, not Drizzle's SQL-text wrapper.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
    console.error(`[subscription] ${label} degraded:`, cause ?? (error instanceof Error ? error.message : error));
    return fallback;
  }
}

/**
 * Active billing-sourced product ids. A user can hold Plus and Connector at
 * once, so this returns all of them rather than picking one arbitrarily.
 */
async function activeBillingProductIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ productId: Entitlements.productId })
    .from(Entitlements)
    .where(
      and(
        eq(Entitlements.userId, userId),
        eq(Entitlements.status, 'active'),
        eq(Entitlements.source, 'billing'),
      ),
    );
  return rows.map((row) => row.productId).filter((id): id is string => Boolean(id));
}

/** Primary plan for the account — Plus wins when both are held. */
function resolvePlanKeyFromProducts(productIds: string[]): PlanKey | null {
  const keys = productIds.map((id) => planForProductId(id)?.key).filter(Boolean) as PlanKey[];
  if (keys.includes('plus')) return 'plus';
  return keys[0] ?? null;
}

/** True when Plus (or any feature) was granted via Polar checkout — portal can open. */
async function hasBillingManagedEntitlement(userId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: Entitlements.id })
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
  return Boolean(row);
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
    billingProductIds,
    canManageBilling,
    foundingClaimedAt,
  ] = await Promise.all([
    hasUnlimitedNotes(auth),
    hasSharedSpacesAddOn(auth),
    getUserNoteCount(userId),
    getReferralBonusNotes(userId),
    softRead('sharedSpacesOwnedCount', () => getSharedSpacesOwnedCount(userId), 0),
    getActiveEntitlements(userId),
    limitsForUser(userId),
    softRead('activeBillingProductIds', () => activeBillingProductIds(userId), [] as string[]),
    softRead('hasBillingManagedEntitlement', () => hasBillingManagedEntitlement(userId), false),
    softRead('foundingClaimedAt', () => getFoundingClaimedAt(userId), null as Date | null),
  ]);

  const planKey = resolvePlanKeyFromProducts(billingProductIds);
  const sharedSpacesOwnedLimit = hasSharedSpaces ? limits.ownedSpaces : FREE_OWNED_SHARED_SPACES_LIMIT;
  const summaries = canManageBilling ? await getPolarBillingSummaries(userId) : {};

  return {
    hasUnlimited,
    hasSharedSpaces,
    /** Connector is a separate product with its own subscription. */
    hasConnector: (entitlements as FeatureKey[]).includes('connector'),
    /**
     * Claimed the founding offer (first 99) — drives the "Founding" badge.
     *
     * Read from the stamped claim, never from the product: founding is a
     * `duration: once` discount on the standard annual product, so a founder's
     * subscription is indistinguishable from anyone else's. The stamp also has
     * to outlive the first renewal, when the discount is gone but the person is
     * still a founder.
     */
    isFounding: Boolean(foundingClaimedAt),
    entitlements: entitlements as FeatureKey[],
    planKey,
    /** Polar checkout exists — in-app manage + payment portal. False for admin_grant / trial. */
    canManageBilling,
    billing: summaries.plus ?? null,
    connectorBilling: summaries.connector ?? null,
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
