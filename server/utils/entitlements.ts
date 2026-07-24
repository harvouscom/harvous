/**
 * Feature entitlements — DB source of truth for paid access.
 *
 * Gates check feature keys via this module. Provider sync (Paddle) promotes
 * entitlements on purchase; cancel clears only `source='billing'` rows.
 * Reconcile-on-read never auto-revokes (matches the prior Clerk sync contract).
 */

import {
  db,
  first,
  Entitlements,
  UserMetadata,
  eq,
  and,
} from '../db';
import type { Auth } from '../middleware/types';
import {
  type FeatureKey,
  type PlanLimits,
  featuresForPriceId,
  limitsForFeatures,
  planForPriceId,
  isFeatureKey,
} from '@/lib/billing-plans';
import { getPaddleClient, isPaddleConfigured } from './paddle-client';

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

/** Upsert entitlement rows for every feature granted by a price. */
export async function setEntitlementsForPrice(
  userId: string,
  priceId: string,
  enabled: boolean,
  source: EntitlementSource = 'billing',
  providerRef?: string | null,
): Promise<void> {
  const features = featuresForPriceId(priceId);
  if (features.length === 0) {
    console.warn(`[entitlements] No features mapped for price ${priceId}`);
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
          priceId,
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
        priceId,
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
    priceId: null,
    grantedAt: now,
    expiresAt: null,
    updatedAt: now,
  });
}

export async function getPaddleCustomerId(userId: string): Promise<string | null> {
  const row = first(
    await db
      .select({ paddleCustomerId: UserMetadata.paddleCustomerId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
  );
  return row?.paddleCustomerId ?? null;
}

export async function setPaddleCustomerId(userId: string, customerId: string): Promise<void> {
  const now = new Date();
  const updated = await db
    .update(UserMetadata)
    .set({ paddleCustomerId: customerId, updatedAt: now })
    .where(eq(UserMetadata.userId, userId))
    .returning({ userId: UserMetadata.userId });

  if (updated.length > 0) return;

  await db.insert(UserMetadata).values({
    id: crypto.randomUUID(),
    userId,
    paddleCustomerId: customerId,
    highestSimpleNoteId: 0,
    userColor: 'blue',
    createdAt: now,
    updatedAt: now,
  });
}

type PaddleSubLike = {
  id?: string;
  status?: string;
  items?: Array<{ price?: { id?: string }; priceId?: string; price_id?: string }>;
  customData?: { clerkUserId?: string } | null;
  custom_data?: { clerkUserId?: string } | null;
};

function priceIdFromSub(sub: PaddleSubLike): string | null {
  const item = sub.items?.[0];
  return item?.price?.id ?? item?.priceId ?? item?.price_id ?? null;
}

function subIsActive(status: string | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

/**
 * Reconcile billing entitlements from Paddle. Promotes when an active
 * subscription is found; never auto-revokes (cancel path is webhook / explicit).
 */
export async function syncEntitlementsFromProvider(
  userId: string,
): Promise<{ entitlements: FeatureKey[]; updated: boolean; hasSharedSpaces: boolean }> {
  const before = await listActiveFeatureKeys(userId);

  if (!isPaddleConfigured()) {
    return {
      entitlements: before,
      updated: false,
      hasSharedSpaces: before.includes('shared_spaces'),
    };
  }

  const customerId = await getPaddleCustomerId(userId);
  if (!customerId) {
    return {
      entitlements: before,
      updated: false,
      hasSharedSpaces: before.includes('shared_spaces'),
    };
  }

  let updated = false;
  try {
    const paddle = getPaddleClient();
    const collection = paddle.subscriptions.list({ customerId: [customerId] });
    const subs: PaddleSubLike[] = [];
    for await (const sub of collection) {
      subs.push(sub as PaddleSubLike);
    }

    for (const sub of subs) {
      if (!subIsActive(sub.status)) continue;
      const priceId = priceIdFromSub(sub);
      if (!priceId || !planForPriceId(priceId)) continue;
      const had = before.includes('shared_spaces');
      await setEntitlementsForPrice(userId, priceId, true, 'billing', sub.id ?? null);
      if (!had) updated = true;
    }

    if (subs.length > 0 && !subs.some((s) => subIsActive(s.status)) && before.includes('shared_spaces')) {
      console.warn(
        `[entitlements] DB has shared_spaces but Paddle has no active subscription for ${userId} — not auto-revoking`,
      );
    }
  } catch (error) {
    console.error('[entitlements] Paddle sync failed:', error);
  }

  const after = await listActiveFeatureKeys(userId);
  return {
    entitlements: after,
    updated: updated || after.length !== before.length,
    hasSharedSpaces: after.includes('shared_spaces'),
  };
}

/** Apply a Paddle subscription event to billing entitlements. */
export async function applyPaddleSubscriptionEntitlement(options: {
  userId: string;
  priceId: string | null;
  subscriptionId: string | null;
  enabled: boolean;
}): Promise<void> {
  const { userId, priceId, subscriptionId, enabled } = options;
  if (!priceId) {
    if (!enabled) {
      // Cancel without price: clear all billing-source rows for the user.
      const now = new Date();
      await db
        .update(Entitlements)
        .set({ status: 'canceled', updatedAt: now })
        .where(and(eq(Entitlements.userId, userId), eq(Entitlements.source, 'billing')));
    }
    return;
  }
  await setEntitlementsForPrice(userId, priceId, enabled, 'billing', subscriptionId);
}
