/**
 * Tier limits — Drizzle port of src/utils/tier-limits.ts
 */

import { db, Spaces, Members, eq } from '../db';
import type { Auth } from '../middleware/types';

const MEMBERS_PER_SPACE_CAP = 150;

export const TIER_LIMITS = {
  free: {
    /** Spaces you own that have sharing/members; see SPACE_MODES_PRODUCT.md */
    ownedSharedSpaces: 3,
    membersPerSpace: MEMBERS_PER_SPACE_CAP,
    joinableSpaces: Infinity,
  },
  unlimited: {
    ownedSharedSpaces: Infinity,
    membersPerSpace: MEMBERS_PER_SPACE_CAP,
    joinableSpaces: Infinity,
  }
} as const;

export type UserTier = 'free' | 'unlimited';

export function getUserTier(auth: Auth): UserTier {
  return auth.has({ feature: 'unlimited_notes' }) ? 'unlimited' : 'free';
}

export function getTierLimits(tier: UserTier) {
  return TIER_LIMITS[tier];
}

export async function getTierForUserId(userId: string): Promise<UserTier> {
  try {
    const { createClerkClient } = await import('@clerk/backend');
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return 'free';
    const clerkClient = createClerkClient({ secretKey });
    const subscription = await (clerkClient as any).billing.getUserBillingSubscription(userId);
    if (!subscription?.subscriptionItems?.length) return 'free';
    for (const item of subscription.subscriptionItems) {
      const plan = item.plan;
      if (!plan?.features?.length) continue;
      const hasUnlimited = plan.features.some(
        (f: { slug?: string }) => f.slug === 'unlimited_notes'
      );
      if (hasUnlimited) return 'unlimited';
    }
    return 'free';
  } catch {
    return 'free';
  }
}

export async function getSharedSpacesOwnedCount(userId: string): Promise<number> {
  const ownedSpaces = await db.select({ id: Spaces.id, shareToken: Spaces.shareToken })
    .from(Spaces).where(eq(Spaces.userId, userId));

  let sharedCount = 0;
  for (const space of ownedSpaces) {
    const hasShareLink = space.shareToken != null && space.shareToken.length > 0;
    if (hasShareLink) { sharedCount++; continue; }
    const memberRows = await db.select().from(Members).where(eq(Members.spaceId, space.id));
    if (memberRows.length > 0) sharedCount++;
  }
  return sharedCount;
}

export async function getSpaceMembershipCount(userId: string): Promise<number> {
  const memberships = await db.select().from(Members).where(eq(Members.userId, userId));
  return memberships.length;
}

export async function getSpaceMemberCount(spaceId: string): Promise<number> {
  const members = await db.select().from(Members).where(eq(Members.spaceId, spaceId));
  return members.length;
}

export async function canCreateSharedSpace(
  userId: string, auth: Auth
): Promise<{ allowed: boolean; reason?: string; currentCount?: number; limit?: number }> {
  const tier = getUserTier(auth);
  const limits = getTierLimits(tier);
  const currentCount = await getSharedSpacesOwnedCount(userId);
  if (currentCount >= limits.ownedSharedSpaces) {
    return {
      allowed: false,
      reason: tier === 'free'
        ? `You've used all ${limits.ownedSharedSpaces} shared spaces. Upgrade for unlimited.`
        : 'Unlimited tier shared spaces limit reached.',
      currentCount, limit: limits.ownedSharedSpaces,
    };
  }
  return { allowed: true, currentCount, limit: limits.ownedSharedSpaces };
}

export async function canOwnerAddOneMoreSharedSpace(
  ownerUserId: string, spaceId: string, ownerAuth?: Auth
): Promise<{ allowed: boolean; reason?: string; currentCount?: number; limit?: number }> {
  const currentMemberCount = await getSpaceMemberCount(spaceId);
  if (currentMemberCount > 0) return { allowed: true };
  const tier = ownerAuth ? getUserTier(ownerAuth) : await getTierForUserId(ownerUserId);
  const limits = getTierLimits(tier);
  const currentSharedCount = await getSharedSpacesOwnedCount(ownerUserId);
  const wouldBeSharedCount = currentSharedCount + 1;
  if (wouldBeSharedCount > limits.ownedSharedSpaces) {
    return {
      allowed: false,
      reason: tier === 'free'
        ? `You've used all ${limits.ownedSharedSpaces} shared spaces. Upgrade for unlimited.`
        : 'Unlimited tier shared spaces limit reached.',
      currentCount: currentSharedCount, limit: limits.ownedSharedSpaces,
    };
  }
  return { allowed: true, currentCount: currentSharedCount, limit: limits.ownedSharedSpaces };
}

export async function canAddMemberToSpace(
  spaceId: string, _spaceOwnerId: string, ownerAuth: Auth
): Promise<{ allowed: boolean; reason?: string; currentCount?: number; limit?: number }> {
  const tier = getUserTier(ownerAuth);
  const limits = getTierLimits(tier);
  const currentCount = await getSpaceMemberCount(spaceId);
  if (currentCount >= limits.membersPerSpace) {
    return { allowed: false, reason: 'This space has reached its people limit.', currentCount, limit: limits.membersPerSpace };
  }
  return { allowed: true, currentCount, limit: limits.membersPerSpace };
}

export async function canAddMemberToSpaceByOwnerId(
  spaceId: string, _spaceOwnerId: string
): Promise<{ allowed: boolean; reason?: string; currentCount?: number; limit?: number }> {
  // Both free and unlimited tiers share the same membersPerSpace limit (MEMBERS_PER_SPACE_CAP),
  // so there's no need to look up the owner's tier via a Clerk API call.
  const limit = MEMBERS_PER_SPACE_CAP;
  const currentCount = await getSpaceMemberCount(spaceId);
  if (currentCount >= limit) {
    return { allowed: false, reason: 'This space has reached its people limit.', currentCount, limit };
  }
  return { allowed: true, currentCount, limit };
}

export async function canJoinSpace(
  userId: string, auth: Auth
): Promise<{ allowed: boolean; reason?: string; currentCount?: number; limit?: number | null }> {
  const tier = getUserTier(auth);
  const limits = getTierLimits(tier);
  if (limits.joinableSpaces === Infinity) return { allowed: true, limit: null };
  const currentCount = await getSpaceMembershipCount(userId);
  if (currentCount >= limits.joinableSpaces) {
    return { allowed: false, reason: `Free tier limited to ${limits.joinableSpaces} space memberships. Upgrade to join more.`, currentCount, limit: limits.joinableSpaces };
  }
  return { allowed: true, currentCount, limit: limits.joinableSpaces };
}

export async function getUserLimitsInfo(userId: string, auth: Auth) {
  const tier = getUserTier(auth);
  const limits = getTierLimits(tier);
  const [sharedSpacesOwned, spaceMemberships] = await Promise.all([
    getSharedSpacesOwnedCount(userId),
    getSpaceMembershipCount(userId),
  ]);
  return {
    tier,
    limits: {
      ownedSharedSpaces: { current: sharedSpacesOwned, limit: limits.ownedSharedSpaces, remaining: limits.ownedSharedSpaces - sharedSpacesOwned },
      membersPerSpace: { limit: limits.membersPerSpace },
      joinableSpaces: { current: spaceMemberships, limit: limits.joinableSpaces, remaining: limits.joinableSpaces === Infinity ? Infinity : limits.joinableSpaces - spaceMemberships },
    },
  };
}

export async function getSpaceMemberInfo(spaceId: string, _spaceOwnerId: string, ownerAuth: Auth) {
  const tier = getUserTier(ownerAuth);
  const limits = getTierLimits(tier);
  const currentCount = await getSpaceMemberCount(spaceId);
  return {
    currentCount,
    limit: limits.membersPerSpace,
    remaining: limits.membersPerSpace - currentCount,
    isAtLimit: currentCount >= limits.membersPerSpace,
    isNearLimit: currentCount >= limits.membersPerSpace * 0.8,
  };
}
