/**
 * Shared Spaces gates — thin wrappers over entitlements + plan limits.
 *
 * Owning shared spaces requires the `shared_spaces` feature (Harvous Plus).
 * Joining is always free. Entitlements live in the Entitlements table (Polar
 * Billing / admin grants); see server/utils/entitlements.ts.
 */

import { db, Spaces, SpaceMemberships, UserMetadata, eq, and, count, first, isNull } from '../db';
import type { Auth } from '../middleware/types';
import {
  hasEntitlement,
  hasEntitlementForUserId,
  setFeatureEntitlement,
  limitsForUser,
} from './entitlements';
import { UNLIMITED, isUnlimited } from '@/lib/billing-plans';

/**
 * Total people in a type='shared' collaborative space (including owner),
 * enforced at invite redeem + admin add-member. Public/broadcast spaces are
 * uncapped (congregation scale) — they are joined via follow/connect, not
 * invites, and canAddMemberToSpace exempts them.
 *
 * This cap — not the space count — is the fence between a personal plan and a
 * church plan. A congregation hits 100 and the space transfers to the org;
 * a small group never touches it. Do not raise this to "be generous" without
 * re-reading that trade: spaces are free to host, seats are the product line.
 */
export const MEMBERS_PER_SPACE_CAP = 100;

/**
 * Owned shared spaces without Plus. Free is strictly private — the paid line is
 * hosting, not a quota. Joining someone else's space is always free, which is
 * how free users experience shared spaces before they ever buy.
 */
export const FREE_OWNED_SHARED_SPACES_LIMIT = 0;

/** Owned shared spaces with Harvous Plus — unlimited; the member cap is the fence. */
export const OWNED_SHARED_SPACES_ADDON_LIMIT = UNLIMITED;

// ─── Shared Spaces entitlement ──────────────────────────────────────────────

export async function hasSharedSpacesAddOn(auth: Auth): Promise<boolean> {
  return hasEntitlement(auth, 'shared_spaces');
}

export async function hasSharedSpacesAddOnForUserId(userId: string): Promise<boolean> {
  return hasEntitlementForUserId(userId, 'shared_spaces');
}

/** Admin / test grant — writes Entitlements (source=admin_grant). */
export async function setSharedSpacesAddOnForUserId(userId: string, enabled: boolean): Promise<void> {
  await setFeatureEntitlement(userId, 'shared_spaces', enabled, 'admin_grant');
  console.log(`[billing-sync] set shared_spaces admin_grant=${enabled} for ${userId}`);
}

// ─── Shared-space counts + gates ────────────────────────────────────────────

/**
 * Spaces the user owns with type='shared' (the only thing the paid gate counts).
 * Org-sponsored spaces (orgId set) bill to the church (Churches.billingPlan /
 * isActive pilot), never against the creating staffer's personal Plus limit.
 */
export async function getSharedSpacesOwnedCount(userId: string): Promise<number> {
  const row = first(await db
    .select({ cnt: count() })
    .from(Spaces)
    .where(and(eq(Spaces.userId, userId), eq(Spaces.type, 'shared'), isNull(Spaces.orgId))));
  return Number(row?.cnt ?? 0);
}

/** Total people in a space (all SpaceMemberships rows, including owner). */
export async function getSpaceMemberCount(spaceId: string): Promise<number> {
  const row = first(await db
    .select({ cnt: count() })
    .from(SpaceMemberships)
    .where(eq(SpaceMemberships.spaceId, spaceId)));
  return Number(row?.cnt ?? 0);
}

/**
 * The paid gate. Runs at exactly the "own one more shared space" moments.
 * Church-sponsored Shared Spaces use POST /api/spaces/create-church-shared
 * (staff-gated, Churches.isActive) — not this function.
 *
 * Downgrade rule: never evict — only new creates are blocked when over cap.
 */
export async function canCreateSharedSpace(
  userId: string,
  auth: Auth,
): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number | null; upgradeUrl?: string }> {
  const currentCount = await getSharedSpacesOwnedCount(userId);
  const hasPlus = await hasSharedSpacesAddOn(auth);
  const limits = await limitsForUser(userId);
  const ownedLimit = hasPlus ? limits.ownedSpaces : FREE_OWNED_SHARED_SPACES_LIMIT;

  if (!hasPlus) {
    return {
      allowed: false,
      reason: 'Owning shared spaces requires Harvous Plus. Joining spaces is always free.',
      currentCount,
      limit: FREE_OWNED_SHARED_SPACES_LIMIT,
      upgradeUrl: '/upgrade',
    };
  }
  // Plus is unlimited today; the explicit guard keeps a future capped plan honest
  // (a plain `currentCount >= ownedLimit` would block everything at UNLIMITED = -1).
  if (!isUnlimited(ownedLimit) && currentCount >= ownedLimit) {
    return {
      allowed: false,
      reason: `You can own up to ${ownedLimit} shared spaces.`,
      currentCount,
      limit: ownedLimit,
    };
  }
  return { allowed: true, currentCount, limit: ownedLimit };
}

/**
 * People cap from the space owner's plan. Public/broadcast spaces are exempt.
 * Never-evict: only blocks new joins when already at or over the cap.
 */
export async function canAddMemberToSpace(
  spaceId: string,
): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number }> {
  const space = first(await db
    .select({ type: Spaces.type, userId: Spaces.userId })
    .from(Spaces)
    .where(eq(Spaces.id, spaceId))
    .limit(1));
  const currentCount = await getSpaceMemberCount(spaceId);
  if (space?.type === 'public') {
    return { allowed: true, currentCount, limit: MEMBERS_PER_SPACE_CAP };
  }

  let limit = MEMBERS_PER_SPACE_CAP;
  if (space?.userId) {
    const ownerLimits = await limitsForUser(space.userId);
    limit = ownerLimits.membersPerSpace || MEMBERS_PER_SPACE_CAP;
  }

  if (currentCount >= limit) {
    return { allowed: false, reason: 'This space has reached its people limit.', currentCount, limit };
  }
  return { allowed: true, currentCount, limit };
}

/**
 * Summary for /api/user/limits.
 *
 * Unlimited is reported as `UNLIMITED` (-1), never `Infinity`: this payload is
 * JSON, and `JSON.stringify(Infinity)` is `null` — which a numeric client
 * compare reads as 0, i.e. "no capacity". Clients must use `isUnlimited()`.
 */
export async function getUserLimitsInfo(userId: string, auth: Auth) {
  const [hasPlus, sharedSpacesOwned, limits] = await Promise.all([
    hasSharedSpacesAddOn(auth),
    getSharedSpacesOwnedCount(userId),
    limitsForUser(userId),
  ]);
  const ownedLimit = hasPlus ? limits.ownedSpaces : FREE_OWNED_SHARED_SPACES_LIMIT;
  const ownedRemaining = isUnlimited(ownedLimit)
    ? UNLIMITED
    : Math.max(0, ownedLimit - sharedSpacesOwned);
  return {
    tier: (hasPlus ? 'unlimited' : 'free') as 'free' | 'unlimited',
    hasSharedSpacesAddOn: hasPlus,
    limits: {
      ownedSharedSpaces: { current: sharedSpacesOwned, limit: ownedLimit, remaining: ownedRemaining },
      membersPerSpace: { limit: limits.membersPerSpace },
      joinableSpaces: { current: 0, limit: UNLIMITED, remaining: UNLIMITED },
    },
  };
}

// ─── Legacy tier plumbing (retired; kept for backfill script + inert status) ─

/** @deprecated The 'unlimited' tier is retired and grants nothing. */
export type UserTier = 'free' | 'unlimited';

/** @deprecated Retired tier — only inert `hasUnlimited` on status reads this. */
export async function getTierForAuth(auth: Auth): Promise<UserTier> {
  if (!auth.userId) return 'free';
  try {
    const row = first(await db
      .select({ tier: UserMetadata.tier })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, auth.userId))
      .limit(1));
    return row?.tier === 'unlimited' ? 'unlimited' : 'free';
  } catch {
    return 'free';
  }
}

/** @deprecated Retired tier — kept for server/scripts/backfill-tier-from-clerk.ts. */
export async function getTierForUserId(userId: string): Promise<UserTier> {
  try {
    const row = first(await db
      .select({ tier: UserMetadata.tier })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1));
    return row?.tier === 'unlimited' ? 'unlimited' : 'free';
  } catch {
    return 'free';
  }
}

/** @deprecated Retired tier — kept for server/scripts/backfill-tier-from-clerk.ts. */
export async function setTierForUserId(userId: string, tier: UserTier): Promise<void> {
  await db
    .update(UserMetadata)
    .set({ tier, updatedAt: new Date() })
    .where(eq(UserMetadata.userId, userId));
}
