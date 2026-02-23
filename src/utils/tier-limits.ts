/**
 * Tier Limits for Collaborative Shared Spaces
 *
 * User-facing: Free = 200 notes (paid = unlimited notes). Shared spaces are unlimited for all tiers.
 * Invisible cap: 150 people per space (both tiers), like YouVersion. No join limit.
 *
 * - Free tier: 200 notes, unlimited shared spaces, unlimited join, 150 people/space (invisible)
 * - Unlimited tier: unlimited notes, unlimited shared spaces, unlimited join, 150 people/space (invisible)
 */

import { db, Spaces, Members, eq } from 'astro:db';
import type { Auth } from '@clerk/astro/server';

/** Invisible cap per space (not shown in UI). Same for both tiers. */
const MEMBERS_PER_SPACE_CAP = 150;

// Tier limits configuration
export const TIER_LIMITS = {
  free: {
    ownedSharedSpaces: Infinity, // No limit; only note limit is enforced
    membersPerSpace: MEMBERS_PER_SPACE_CAP,
    joinableSpaces: Infinity, // No join limit
  },
  unlimited: {
    ownedSharedSpaces: Infinity, // No limit
    membersPerSpace: MEMBERS_PER_SPACE_CAP,
    joinableSpaces: Infinity, // No limit
  }
} as const;

export type UserTier = 'free' | 'unlimited';

/**
 * Get user's tier from Clerk auth
 * Checks for 'unlimited_notes' feature flag
 */
export function getUserTier(auth: Auth): UserTier {
  // Check if user has unlimited plan via Clerk features
  return auth.has({ feature: 'unlimited_notes' }) ? 'unlimited' : 'free';
}

/**
 * Get the tier limits for a specific tier
 */
export function getTierLimits(tier: UserTier) {
  return TIER_LIMITS[tier];
}

/**
 * Get tier for a user by ID (e.g. space owner when requester is not the owner).
 * Uses Clerk backend billing API; defaults to 'free' on error or missing subscription.
 */
export async function getTierForUserId(userId: string): Promise<UserTier> {
  try {
    const { createClerkClient } = await import('@clerk/backend');
    const secretKey = import.meta.env.CLERK_SECRET_KEY;
    if (!secretKey) return 'free';
    const clerkClient = createClerkClient({ secretKey });
    const subscription = await clerkClient.billing.getUserBillingSubscription(userId);
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

/**
 * Check if the space owner can add one more shared space (i.e. adding the first member to this space).
 * Use when the requester may not be the owner (e.g. join/accept). When requester is the owner, pass ownerAuth.
 */
export async function canOwnerAddOneMoreSharedSpace(
  ownerUserId: string,
  spaceId: string,
  ownerAuth?: Auth
): Promise<{
  allowed: boolean;
  reason?: string;
  currentCount?: number;
  limit?: number;
}> {
  const currentMemberCount = await getSpaceMemberCount(spaceId);
  if (currentMemberCount > 0) {
    return { allowed: true };
  }
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
      currentCount: currentSharedCount,
      limit: limits.ownedSharedSpaces
    };
  }
  return {
    allowed: true,
    currentCount: currentSharedCount,
    limit: limits.ownedSharedSpaces
  };
}

/**
 * Count how many shared spaces user owns.
 * Matches UI definition: shared = has share link (shareToken) OR has at least one member.
 * Same logic as /api/profile/my-shared-spaces so the limit count matches what users see.
 */
export async function getSharedSpacesOwnedCount(userId: string): Promise<number> {
  const ownedSpaces = await db
    .select({ id: Spaces.id, shareToken: Spaces.shareToken })
    .from(Spaces)
    .where(eq(Spaces.userId, userId))
    .all();

  let sharedCount = 0;
  for (const space of ownedSpaces) {
    const hasShareLink = space.shareToken != null && space.shareToken.length > 0;
    if (hasShareLink) {
      sharedCount++;
      continue;
    }
    const memberRows = await db.select()
      .from(Members)
      .where(eq(Members.spaceId, space.id))
      .all();
    if (memberRows.length > 0) {
      sharedCount++;
    }
  }

  return sharedCount;
}

/**
 * Count how many spaces user is a member of (excluding owned spaces)
 */
export async function getSpaceMembershipCount(userId: string): Promise<number> {
  const memberships = await db.select()
    .from(Members)
    .where(eq(Members.userId, userId))
    .all();

  return memberships.length;
}

/**
 * Count how many members a space has
 */
export async function getSpaceMemberCount(spaceId: string): Promise<number> {
  const members = await db.select()
    .from(Members)
    .where(eq(Members.spaceId, spaceId))
    .all();

  return members.length;
}

/**
 * Check if user can create a new shared space
 */
export async function canCreateSharedSpace(
  userId: string,
  auth: Auth
): Promise<{
  allowed: boolean;
  reason?: string;
  currentCount?: number;
  limit?: number;
}> {
  const tier = getUserTier(auth);
  const limits = getTierLimits(tier);
  const currentCount = await getSharedSpacesOwnedCount(userId);

  if (currentCount >= limits.ownedSharedSpaces) {
    return {
      allowed: false,
      reason: tier === 'free'
        ? `You've used all ${limits.ownedSharedSpaces} shared spaces. Upgrade for unlimited.`
        : 'Unlimited tier shared spaces limit reached.',
      currentCount,
      limit: limits.ownedSharedSpaces,
    };
  }

  return {
    allowed: true,
    currentCount,
    limit: limits.ownedSharedSpaces,
  };
}

/**
 * Check if user can join a new space (as a member)
 */
export async function canJoinSpace(
  userId: string,
  auth: Auth
): Promise<{
  allowed: boolean;
  reason?: string;
  currentCount?: number;
  limit?: number | null;
}> {
  const tier = getUserTier(auth);
  const limits = getTierLimits(tier);

  // Unlimited tier has no limit
  if (limits.joinableSpaces === Infinity) {
    return { allowed: true, limit: null };
  }

  const currentCount = await getSpaceMembershipCount(userId);

  if (currentCount >= limits.joinableSpaces) {
    return {
      allowed: false,
      reason: `Free tier limited to ${limits.joinableSpaces} space memberships. Upgrade to join more.`,
      currentCount,
      limit: limits.joinableSpaces,
    };
  }

  return {
    allowed: true,
    currentCount,
    limit: limits.joinableSpaces,
  };
}

/**
 * Check if space owner can add more members to their space
 * Considers space owner's tier (from owner's auth)
 */
export async function canAddMemberToSpace(
  spaceId: string,
  spaceOwnerId: string,
  ownerAuth: Auth
): Promise<{
  allowed: boolean;
  reason?: string;
  currentCount?: number;
  limit?: number;
}> {
  const tier = getUserTier(ownerAuth);
  const limits = getTierLimits(tier);
  const currentCount = await getSpaceMemberCount(spaceId);

  if (currentCount >= limits.membersPerSpace) {
    return {
      allowed: false,
      reason: 'This space has reached its people limit.',
      currentCount,
      limit: limits.membersPerSpace,
    };
  }

  return {
    allowed: true,
    currentCount,
    limit: limits.membersPerSpace,
  };
}

/**
 * Check if space owner can add more members (when owner's auth is not available, e.g. join flow).
 * Uses getTierForUserId(spaceOwnerId) to resolve owner's tier.
 */
export async function canAddMemberToSpaceByOwnerId(
  spaceId: string,
  spaceOwnerId: string
): Promise<{
  allowed: boolean;
  reason?: string;
  currentCount?: number;
  limit?: number;
}> {
  const tier = await getTierForUserId(spaceOwnerId);
  const limits = getTierLimits(tier);
  const currentCount = await getSpaceMemberCount(spaceId);

  if (currentCount >= limits.membersPerSpace) {
    return {
      allowed: false,
      reason: 'This space has reached its people limit.',
      currentCount,
      limit: limits.membersPerSpace,
    };
  }

  return {
    allowed: true,
    currentCount,
    limit: limits.membersPerSpace,
  };
}

/**
 * Get comprehensive tier limits info for user
 * Useful for displaying usage in UI
 */
export async function getUserLimitsInfo(userId: string, auth: Auth) {
  const tier = getUserTier(auth);
  const limits = getTierLimits(tier);

  const [sharedSpacesOwned, spaceMemberships] = await Promise.all([
    getSharedSpacesOwnedCount(userId),
    getSpaceMembershipCount(userId)
  ]);

  return {
    tier,
    limits: {
      ownedSharedSpaces: {
        current: sharedSpacesOwned,
        limit: limits.ownedSharedSpaces,
        remaining: limits.ownedSharedSpaces - sharedSpacesOwned,
      },
      membersPerSpace: {
        limit: limits.membersPerSpace,
      },
      joinableSpaces: {
        current: spaceMemberships,
        limit: limits.joinableSpaces,
        remaining: limits.joinableSpaces === Infinity
          ? Infinity
          : limits.joinableSpaces - spaceMemberships,
      },
    },
  };
}

/**
 * Get space member count and limit for specific space
 * Limit is invisible cap (150); UI typically does not show "X/150 people"
 */
export async function getSpaceMemberInfo(spaceId: string, spaceOwnerId: string, ownerAuth: Auth) {
  const tier = getUserTier(ownerAuth);
  const limits = getTierLimits(tier);
  const currentCount = await getSpaceMemberCount(spaceId);

  return {
    currentCount,
    limit: limits.membersPerSpace,
    remaining: limits.membersPerSpace - currentCount,
    isAtLimit: currentCount >= limits.membersPerSpace,
    isNearLimit: currentCount >= limits.membersPerSpace * 0.8, // 80% capacity
  };
}
