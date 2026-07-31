/**
 * Feature entitlements — DB source of truth for paid access.
 *
 * Gates check feature keys via this module. Provider sync (Polar) reconciles
 * `source='billing'` rows both ways: promotes when an active subscription is
 * found, and cancels billing rows when Polar has none. Admin/church/trial
 * sources are never touched by sync. Webhooks still apply the same cancel path.
 *
 * The provider is keyed by `externalCustomerId` = Clerk userId, so sync and the
 * portal don't depend on a stored Polar customer id (it's kept opportunistically
 * as a fallback / audit only).
 */

import {
  db,
  first,
  Entitlements,
  UserMetadata,
  eq,
  and,
  countDistinct,
} from '../db';
import type { Auth } from '../middleware/types';
import {
  type FeatureKey,
  type PlanLimits,
  featuresForProductId,
  limitsForFeatures,
  planForProductId,
  isFeatureKey,
  foundingPlan,
  FOUNDING_CAP,
} from '@/lib/billing-plans';
import { getPolarClient, isPolarConfigured } from './polar-client';

export type EntitlementSource = 'billing' | 'admin_grant' | 'church_seat' | 'trial';
export type EntitlementStatus = 'active' | 'canceled' | 'expired';

const ACTIVE = 'active' as const;

async function listActiveFeatureKeys(userId: string): Promise<FeatureKey[]> {
  try {
    const rows = await db
      .select({ featureKey: Entitlements.featureKey })
      .from(Entitlements)
      .where(and(eq(Entitlements.userId, userId), eq(Entitlements.status, ACTIVE)));
    const keys = new Set<FeatureKey>();
    for (const row of rows) {
      if (isFeatureKey(row.featureKey)) keys.add(row.featureKey);
    }
    return [...keys];
  } catch (error) {
    console.error('[entitlements] listActiveFeatureKeys failed:', error);
    return [];
  }
}

export async function hasEntitlementForUserId(userId: string, key: FeatureKey): Promise<boolean> {
  const keys = await listActiveFeatureKeys(userId);
  return keys.includes(key);
}

export async function hasEntitlement(auth: Auth, key: FeatureKey): Promise<boolean> {
  if (!auth.userId) return false;
  return hasEntitlementForUserId(auth.userId, key);
}

export async function getActiveEntitlements(userId: string): Promise<FeatureKey[]> {
  return listActiveFeatureKeys(userId);
}

export async function limitsForUser(userId: string): Promise<PlanLimits> {
  const features = await listActiveFeatureKeys(userId);
  return limitsForFeatures(features);
}

/** Upsert entitlement rows for every feature granted by a Polar product. */
export async function setEntitlementsForProduct(
  userId: string,
  productId: string,
  enabled: boolean,
  source: EntitlementSource = 'billing',
  providerRef?: string | null,
): Promise<void> {
  const features = featuresForProductId(productId);
  if (features.length === 0) {
    console.warn(`[entitlements] No features mapped for product ${productId}`);
    return;
  }

  const now = new Date();
  const status: EntitlementStatus = enabled ? 'active' : 'canceled';

  for (const featureKey of features) {
    const existing = first(
      await db
        .select({ id: Entitlements.id })
        .from(Entitlements)
        .where(
          and(
            eq(Entitlements.userId, userId),
            eq(Entitlements.featureKey, featureKey),
            eq(Entitlements.source, source),
          ),
        )
        .limit(1),
    );

    if (existing) {
      await db
        .update(Entitlements)
        .set({
          status,
          productId,
          providerRef: providerRef ?? null,
          updatedAt: now,
          ...(enabled ? { expiresAt: null } : {}),
        })
        .where(eq(Entitlements.id, existing.id));
    } else if (enabled) {
      await db.insert(Entitlements).values({
        id: crypto.randomUUID(),
        userId,
        featureKey,
        status: ACTIVE,
        source,
        providerRef: providerRef ?? null,
        productId,
        grantedAt: now,
        expiresAt: null,
        updatedAt: now,
      });
    }
  }
}

/** Admin / test helper — grant or revoke a single feature under a source. */
export async function setFeatureEntitlement(
  userId: string,
  featureKey: FeatureKey,
  enabled: boolean,
  source: EntitlementSource = 'admin_grant',
): Promise<void> {
  const now = new Date();
  const existing = first(
    await db
      .select({ id: Entitlements.id })
      .from(Entitlements)
      .where(
        and(
          eq(Entitlements.userId, userId),
          eq(Entitlements.featureKey, featureKey),
          eq(Entitlements.source, source),
        ),
      )
      .limit(1),
  );

  if (existing) {
    await db
      .update(Entitlements)
      .set({
        status: enabled ? ACTIVE : 'canceled',
        updatedAt: now,
        ...(enabled ? { expiresAt: null } : {}),
      })
      .where(eq(Entitlements.id, existing.id));
    return;
  }

  if (!enabled) return;

  await db.insert(Entitlements).values({
    id: crypto.randomUUID(),
    userId,
    featureKey,
    status: ACTIVE,
    source,
    providerRef: null,
    productId: null,
    grantedAt: now,
    expiresAt: null,
    updatedAt: now,
  });
}

// ─── Founding cap ───────────────────────────────────────────────────────────

/**
 * How many people have ever claimed the founding price.
 *
 * Counts distinct users with a row on the founding product **regardless of
 * status** — the promise is "the first 99 people", not "99 at a time". A
 * founder who cancels must not quietly free a lifetime-locked slot for someone
 * else, so canceled/expired rows still occupy their claim.
 */
export async function countFoundingClaims(): Promise<number> {
  const plan = foundingPlan();
  if (!plan?.productId) return 0;
  try {
    const row = first(
      await db
        .select({ cnt: countDistinct(Entitlements.userId) })
        .from(Entitlements)
        .where(eq(Entitlements.productId, plan.productId)),
    );
    return Number(row?.cnt ?? 0);
  } catch (error) {
    console.error('[entitlements] countFoundingClaims failed:', error);
    // Fail closed: an unknown count must not hand out an unbounded lifetime price.
    return FOUNDING_CAP;
  }
}

/**
 * Founding slots left (0 when sold out or unconfigured).
 *
 * Known race: two checkouts started at slot 99 can both succeed. Selling 101 of
 * 99 is not worth a distributed lock at launch volume — honor anyone who got a
 * checkout open, and let the overshoot stand.
 */
export async function getFoundingAvailability(): Promise<{
  total: number;
  claimed: number;
  remaining: number;
  available: boolean;
}> {
  const claimed = await countFoundingClaims();
  const remaining = Math.max(0, FOUNDING_CAP - claimed);
  return {
    total: FOUNDING_CAP,
    claimed: Math.min(claimed, FOUNDING_CAP),
    remaining,
    available: remaining > 0 && Boolean(foundingPlan()?.productId),
  };
}

export async function getPolarCustomerId(userId: string): Promise<string | null> {
  const row = first(
    await db
      .select({ polarCustomerId: UserMetadata.polarCustomerId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
  );
  return row?.polarCustomerId ?? null;
}

/** Store the Polar customer id opportunistically (fallback / audit; not required for sync). */
export async function setPolarCustomerId(userId: string, customerId: string): Promise<void> {
  const now = new Date();
  const updated = await db
    .update(UserMetadata)
    .set({ polarCustomerId: customerId, updatedAt: now })
    .where(eq(UserMetadata.userId, userId))
    .returning({ userId: UserMetadata.userId });

  if (updated.length > 0) return;

  await db.insert(UserMetadata).values({
    id: crypto.randomUUID(),
    userId,
    polarCustomerId: customerId,
    highestSimpleNoteId: 0,
    userColor: 'blue',
    createdAt: now,
    updatedAt: now,
  });
}

type PolarSubLike = {
  id?: string;
  status?: string;
  productId?: string | null;
  customerId?: string | null;
};

function subIsActive(status: string | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

/** Cancel all active `source='billing'` entitlement rows for a user. */
async function cancelBillingEntitlements(userId: string): Promise<boolean> {
  const now = new Date();
  const updated = await db
    .update(Entitlements)
    .set({ status: 'canceled', updatedAt: now })
    .where(
      and(
        eq(Entitlements.userId, userId),
        eq(Entitlements.source, 'billing'),
        eq(Entitlements.status, ACTIVE),
      ),
    )
    .returning({ id: Entitlements.id });
  return updated.length > 0;
}

/** Per-user watermark for opportunistic (`throttle: true`) reconciles. */
const RECONCILE_THROTTLE_MS = 5 * 60 * 1000;
const lastReconcileAt = new Map<string, number>();

/**
 * Reconcile billing entitlements from Polar.
 * Promotes when an active known-product subscription is found; cancels
 * `source='billing'` rows when Polar reports none (customer deleted / fully
 * canceled). Polar API failures do not revoke. Keyed by externalCustomerId =
 * userId, so no stored customer id is required.
 *
 * Pass `throttle: true` for opportunistic reconciles on hot read paths (see
 * GET /api/subscription/status, which the sidebar mounts for every session with a 30s
 * staleTime plus refetch-on-focus — that was a live Polar round-trip per read). Webhooks
 * remain the primary path, so a skipped reconcile only delays reconciliation, and any
 * explicit user action (checkout return, POST /api/billing/sync) must omit the flag.
 *
 * The watermark is per Lambda instance, so this bounds rather than eliminates the calls —
 * it collapses a warm instance's repeat reads, which is where the volume was.
 */
export async function syncEntitlementsFromProvider(
  userId: string,
  options?: { throttle?: boolean },
): Promise<{ entitlements: FeatureKey[]; updated: boolean; hasSharedSpaces: boolean }> {
  const before = await listActiveFeatureKeys(userId);

  if (!isPolarConfigured()) {
    return {
      entitlements: before,
      updated: false,
      hasSharedSpaces: before.includes('shared_spaces'),
    };
  }

  if (options?.throttle) {
    const last = lastReconcileAt.get(userId) ?? 0;
    if (Date.now() - last < RECONCILE_THROTTLE_MS) {
      return {
        entitlements: before,
        updated: false,
        hasSharedSpaces: before.includes('shared_spaces'),
      };
    }
    lastReconcileAt.set(userId, Date.now());
  }

  let updated = false;
  try {
    const polar = getPolarClient();
    const collection = await polar.subscriptions.list({ externalCustomerId: [userId], active: true });
    const subs: PolarSubLike[] = [];
    for await (const page of collection) {
      for (const sub of page.result?.items ?? []) {
        subs.push(sub as PolarSubLike);
      }
    }

    let grantedFromPolar = false;
    for (const sub of subs) {
      if (!subIsActive(sub.status)) continue;
      const productId = sub.productId ?? null;
      if (!productId || !planForProductId(productId)) continue;
      grantedFromPolar = true;
      const had = before.includes('shared_spaces');
      await setEntitlementsForProduct(userId, productId, true, 'billing', sub.id ?? null);
      if (sub.customerId) await setPolarCustomerId(userId, sub.customerId);
      if (!had) updated = true;
    }

    if (!grantedFromPolar) {
      if (await cancelBillingEntitlements(userId)) {
        updated = true;
        console.info(
          `[entitlements] No active Polar subscription for ${userId} — canceled billing entitlements`,
        );
      }
    }
  } catch (error) {
    // Fail closed: do not revoke on Polar outages / auth errors.
    console.error('[entitlements] Polar sync failed:', error);
  }

  const after = await listActiveFeatureKeys(userId);
  return {
    entitlements: after,
    updated: updated || after.length !== before.length,
    hasSharedSpaces: after.includes('shared_spaces'),
  };
}

/** Apply a Polar subscription/order event to billing entitlements. */
export async function applyPolarSubscriptionEntitlement(options: {
  userId: string;
  productId: string | null;
  subscriptionId: string | null;
  enabled: boolean;
}): Promise<void> {
  const { userId, productId, subscriptionId, enabled } = options;
  if (!productId) {
    if (!enabled) {
      // Cancel without product: clear all billing-source rows for the user.
      await cancelBillingEntitlements(userId);
    }
    return;
  }
  await setEntitlementsForProduct(userId, productId, enabled, 'billing', subscriptionId);
}
