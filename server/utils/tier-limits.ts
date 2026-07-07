/**
 * Entitlements + limits for the Shared Spaces add-on.
 *
 * Owning shared spaces is gated by the "Shared Spaces" add-on (owner pays;
 * joining is always free). The entitlement source of truth is
 * `UserMetadata.sharedSpacesAddOn`; until the billing webhook lands, a
 * freshly-purchased session is also honored via the Clerk JWT `shared_spaces`
 * feature (disabled by `BILLING_TIER_DB_ONLY=true`).
 *
 * The legacy 'free' | 'unlimited' tier is retired (zero subscribers) and
 * grants nothing; its plumbing is kept only for the backfill script and the
 * inert `hasUnlimited` field on /api/subscription/status.
 */

import { db, Spaces, SpaceMemberships, UserMetadata, eq, and, count, first } from '../db';
import type { Auth } from '../middleware/types';

/** Total people in a space (including owner), enforced at invite redeem. */
export const MEMBERS_PER_SPACE_CAP = 30;

/** Owned shared spaces without the add-on. */
export const FREE_OWNED_SHARED_SPACES_LIMIT = 0;

/** Max owned shared spaces with the Shared Spaces add-on. */
export const OWNED_SHARED_SPACES_ADDON_LIMIT = 10;

const TIER_DB_ONLY = process.env.BILLING_TIER_DB_ONLY === 'true';

// ─── Shared Spaces add-on entitlement ───────────────────────────────────────

async function readDbSharedSpacesAddOn(userId: string): Promise<boolean> {
  try {
    const row = first(await db
      .select({ sharedSpacesAddOn: UserMetadata.sharedSpacesAddOn })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1));
    return row?.sharedSpacesAddOn === true;
  } catch {
    return false;
  }
}

/**
 * Whether the request's user holds the Shared Spaces add-on. DB first; the
 * Clerk JWT `shared_spaces` feature covers the purchase→webhook gap.
 */
export async function hasSharedSpacesAddOn(auth: Auth): Promise<boolean> {
  if (!auth.userId) return false;
  if (await readDbSharedSpacesAddOn(auth.userId)) return true;
  if (!TIER_DB_ONLY && auth.has({ feature: 'shared_spaces' })) return true;
  return false;
}

/** DB-only entitlement check for paths without an auth context (scripts, admin grants). */
export async function hasSharedSpacesAddOnForUserId(userId: string): Promise<boolean> {
  return readDbSharedSpacesAddOn(userId);
}

/** Writes the entitlement (billing webhook / admin grant / backfill). Inserts metadata when missing. */
export async function setSharedSpacesAddOnForUserId(userId: string, enabled: boolean): Promise<void> {
  const now = new Date();
  const updated = await db
    .update(UserMetadata)
    .set({ sharedSpacesAddOn: enabled, sharedSpacesAddOnUpdatedAt: now, updatedAt: now })
    .where(eq(UserMetadata.userId, userId))
    .returning({ userId: UserMetadata.userId });

  if (updated.length > 0) return;

  await db.insert(UserMetadata).values({
    id: crypto.randomUUID(),
    userId,
    sharedSpacesAddOn: enabled,
    sharedSpacesAddOnUpdatedAt: now,
    highestSimpleNoteId: 0,
    userColor: 'blue',
    createdAt: now,
    updatedAt: now,
  });
  console.log(`[billing-sync] Inserted UserMetadata with sharedSpacesAddOn=${enabled} for ${userId}`);
}

type ClerkSubscriptionRow = {
  status?: string;
  plan_id?: string;
  plan?: { id?: string; slug?: string };
};

function normalizeClerkSubscriptionsPayload(data: unknown): ClerkSubscriptionRow[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: ClerkSubscriptionRow[] }).data;
  }
  return [];
}

function clerkSubscriptionIsActiveSharedSpaces(sub: ClerkSubscriptionRow, planId: string): boolean {
  if (!planId) return false;
  const status = sub.status;
  if (status !== 'active' && status !== 'trialing') return false;
  return (
    sub.plan_id === planId ||
    sub.plan?.id === planId ||
    sub.plan?.slug === planId
  );
}

/**
 * Reconcile `UserMetadata.sharedSpacesAddOn` from Clerk Billing when payment
 * succeeded in Clerk but the DB flag was never written (no webhook yet, user
 * closed the drawer before Continue, stale JWT, etc.). Never auto-revokes.
 */
export async function syncSharedSpacesAddOnFromClerk(
  userId: string,
  auth?: Auth,
): Promise<{ hasSharedSpaces: boolean; updated: boolean }> {
  const dbFlag = await readDbSharedSpacesAddOn(userId);
  const jwtEntitled = Boolean(auth && !TIER_DB_ONLY && auth.has({ feature: 'shared_spaces' }));
  const planId = process.env.CLERK_SHARED_SPACES_PLAN_ID || '';
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;

  if (!clerkSecretKey || !planId) {
    if (jwtEntitled && !dbFlag) {
      await setSharedSpacesAddOnForUserId(userId, true);
      return { hasSharedSpaces: true, updated: true };
    }
    return { hasSharedSpaces: dbFlag || jwtEntitled, updated: false };
  }

  let clerkActive = false;
  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${userId}/billing/subscriptions`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      const subs = normalizeClerkSubscriptionsPayload(data);
      clerkActive = subs.some((sub) => clerkSubscriptionIsActiveSharedSpaces(sub, planId));
    }
  } catch (error) {
    console.error('[billing-sync] Clerk subscriptions fetch failed:', error);
    if (jwtEntitled && !dbFlag) {
      await setSharedSpacesAddOnForUserId(userId, true);
      return { hasSharedSpaces: true, updated: true };
    }
    return { hasSharedSpaces: dbFlag || jwtEntitled, updated: false };
  }

  const entitled = clerkActive || jwtEntitled;

  if (entitled && !dbFlag) {
    await setSharedSpacesAddOnForUserId(userId, true);
    console.log(`[billing-sync] Promoted sharedSpacesAddOn for ${userId}`);
    return { hasSharedSpaces: true, updated: true };
  }

  if (!clerkActive && dbFlag) {
    console.warn(
      `[billing-sync] DB has sharedSpacesAddOn but Clerk has no active ${planId} subscription for ${userId} — not auto-revoking`,
    );
  }

  return { hasSharedSpaces: dbFlag || entitled, updated: false };
}

// ─── Shared-space counts + gates ────────────────────────────────────────────

/** Spaces the user owns with type='shared' (the only thing the paid gate counts). */
export async function getSharedSpacesOwnedCount(userId: string): Promise<number> {
  const row = first(await db
    .select({ cnt: count() })
    .from(Spaces)
    .where(and(eq(Spaces.userId, userId), eq(Spaces.type, 'shared'))));
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
 * The paid gate. Runs at exactly the "own one more shared space" moments
 * (create-shared today; invite creation re-derives from space.type).
 */
export async function canCreateSharedSpace(
  userId: string,
  auth: Auth,
): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number | null; upgradeUrl?: string }> {
  const currentCount = await getSharedSpacesOwnedCount(userId);
  const hasAddOn = await hasSharedSpacesAddOn(auth);
  if (!hasAddOn) {
    return {
      allowed: false,
      reason: 'Owning shared spaces requires the Shared Spaces add-on. Joining spaces is always free.',
      currentCount,
      limit: FREE_OWNED_SHARED_SPACES_LIMIT,
      upgradeUrl: '/addon',
    };
  }
  if (currentCount >= OWNED_SHARED_SPACES_ADDON_LIMIT) {
    return {
      allowed: false,
      reason: `You can own up to ${OWNED_SHARED_SPACES_ADDON_LIMIT} shared spaces.`,
      currentCount,
      limit: OWNED_SHARED_SPACES_ADDON_LIMIT,
    };
  }
  return { allowed: true, currentCount, limit: OWNED_SHARED_SPACES_ADDON_LIMIT };
}

/** People cap, enforced at invite redeem + admin add-member. Same for every entitlement. */
export async function canAddMemberToSpace(
  spaceId: string,
): Promise<{ allowed: boolean; reason?: string; currentCount: number; limit: number }> {
  const currentCount = await getSpaceMemberCount(spaceId);
  if (currentCount >= MEMBERS_PER_SPACE_CAP) {
    return { allowed: false, reason: 'This space has reached its people limit.', currentCount, limit: MEMBERS_PER_SPACE_CAP };
  }
  return { allowed: true, currentCount, limit: MEMBERS_PER_SPACE_CAP };
}

/** Summary for /api/user/limits (shape kept close to the pre-add-on version for existing clients). */
export async function getUserLimitsInfo(userId: string, auth: Auth) {
  const [hasAddOn, sharedSpacesOwned] = await Promise.all([
    hasSharedSpacesAddOn(auth),
    getSharedSpacesOwnedCount(userId),
  ]);
  const limit = hasAddOn ? OWNED_SHARED_SPACES_ADDON_LIMIT : FREE_OWNED_SHARED_SPACES_LIMIT;
  return {
    tier: (hasAddOn ? 'unlimited' : 'free') as 'free' | 'unlimited',
    hasSharedSpacesAddOn: hasAddOn,
    limits: {
      ownedSharedSpaces: { current: sharedSpacesOwned, limit, remaining: limit - sharedSpacesOwned },
      membersPerSpace: { limit: MEMBERS_PER_SPACE_CAP },
      joinableSpaces: { current: 0, limit: Infinity, remaining: Infinity },
    },
  };
}

// ─── Legacy tier plumbing (retired; kept for the backfill script + inert status field) ─

/** @deprecated The 'unlimited' tier is retired and grants nothing. */
export type UserTier = 'free' | 'unlimited';

/** @deprecated Retired tier — only /api/subscription/status's inert `hasUnlimited` reads this. */
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
