/**
 * Tier Limits for Collaborative Shared Spaces
 *
 * Enforces tier-based limits for collaborative features:
 * - Free tier: 1 shared space (5 members max), join up to 3 spaces
 * - Unlimited tier: 3 shared spaces (10 members each), join unlimited spaces
 */

import { db, Spaces, Members, eq, and } from 'astro:db';
import type { Auth } from '@clerk/astro/server';

// Tier limits configuration
export const TIER_LIMITS = {
  free: {
    ownedSharedSpaces: 1,
    membersPerSpace: 5,
    joinableSpaces: 3,
  },
  unlimited: {
    ownedSharedSpaces: 3,
    membersPerSpace: 10,
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
 * Count how many shared spaces user owns
 * (Shared spaces have members beyond just the owner)
 */
export async function getSharedSpacesOwnedCount(userId: string): Promise<number> {
  // Get spaces owned by user
  const ownedSpaces = await db.select()
    .from(Spaces)
    .where(eq(Spaces.userId, userId))
    .all();

  // Count how many have members (making them "shared")
  let sharedCount = 0;
  for (const space of ownedSpaces) {
    const memberCount = await db.select()
      .from(Members)
      .where(eq(Members.spaceId, space.id))
      .all();

    if (memberCount.length > 0) {
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
        ? 'Free tier limited to 1 shared space. Upgrade to create more.'
        : `Unlimited tier limited to ${limits.ownedSharedSpaces} shared spaces.`,
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
 * Considers space owner's tier
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
      reason: tier === 'free'
        ? 'This space has reached the member limit (5 members). Space owner needs to upgrade.'
        : `This space has reached the member limit (${limits.membersPerSpace} members).`,
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
 * Useful for displaying "3/5 members" in UI
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
