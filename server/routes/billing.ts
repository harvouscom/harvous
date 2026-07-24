/**
 * Billing + Subscription + Referral routes — Hono port
 *
 * Endpoints:
 *   POST /api/billing/checkout
 *   GET  /api/billing/portal
 *   POST /api/billing/sync
 *   GET  /api/subscription/status
 *   POST /api/referral/credit
 *   GET  /api/referral/status
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, first, UserMetadata, UserXP, eq, and, count } from '../db';
import { nowISO } from '../db/dates';
import { handleAPIError } from '@/utils/error-handling';
import { getSubscriptionInfo } from '../utils/subscription';
import {
  getPaddleCustomerId,
  setPaddleCustomerId,
  syncEntitlementsFromProvider,
  hasEntitlementForUserId,
} from '../utils/entitlements';
import { getPaddleClient, isPaddleConfigured } from '../utils/paddle-client';
import { listedPlanForInterval, type PlanInterval } from '@/lib/billing-plans';
import { resolveRefToUserId, generateReferralCode } from '../utils/referral-code';
import { ACTIVITY_TYPES, awardXP, getReferralCreditXpForOrdinal } from '../utils/xp-system';
import { getCookie, deleteCookie } from 'hono/cookie';

const app = new Hono();

async function resolveUserEmail(userId: string, metadataEmail?: string | null): Promise<string> {
  if (metadataEmail?.includes('@')) return metadataEmail;
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    throw new Error('Unable to resolve user email for billing');
  }
  const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${clerkSecretKey}` },
  });
  if (!response.ok) {
    throw new Error('Unable to resolve user email for billing');
  }
  const user = (await response.json()) as {
    email_addresses?: Array<{ email_address?: string; id?: string }>;
    primary_email_address_id?: string;
  };
  const primary = user.email_addresses?.find((e) => e.id === user.primary_email_address_id);
  const email = primary?.email_address || user.email_addresses?.[0]?.email_address;
  if (!email) throw new Error('User has no email for billing');
  return email;
}

async function ensurePaddleCustomer(userId: string, metadataEmail?: string | null): Promise<string> {
  const existing = await getPaddleCustomerId(userId);
  if (existing) return existing;

  const email = await resolveUserEmail(userId, metadataEmail);
  const paddle = getPaddleClient();
  const customer = await paddle.customers.create({
    email,
    customData: { clerkUserId: userId },
  });
  await setPaddleCustomerId(userId, customer.id);
  return customer.id;
}

// ─── Billing ────────────────────────────────────────────────────────

/** POST /api/billing/checkout — resolve/create Paddle customer + return price for Paddle.js */
app.post('/api/billing/checkout', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!isPaddleConfigured()) {
      return c.json({ error: 'Billing is not configured' }, 503);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      interval?: PlanInterval | 'annual';
      priceId?: string;
    };

    const interval: PlanInterval =
      body.interval === 'month' ? 'month' : 'year';

    const month = listedPlanForInterval('month');
    const year = listedPlanForInterval('year');
    const allowed = new Set([month?.priceId, year?.priceId].filter(Boolean) as string[]);
    const plan = interval === 'month' ? month : year;
    const priceId = body.priceId && allowed.has(body.priceId) ? body.priceId : plan?.priceId;

    if (!priceId || !allowed.has(priceId)) {
      return c.json({ error: 'Invalid or unconfigured plan price' }, 400);
    }

    const meta = first(
      await db
        .select({ email: UserMetadata.email })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, auth.userId))
        .limit(1),
    );

    const customerId = await ensurePaddleCustomer(auth.userId, meta?.email);
    const resolvedInterval: PlanInterval =
      priceId === month?.priceId ? 'month' : priceId === year?.priceId ? 'year' : interval;

    return c.json({
      priceId,
      customerId,
      customData: { clerkUserId: auth.userId },
      interval: resolvedInterval,
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/billing/checkout', action: 'create_checkout_session' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** GET /api/billing/portal — Paddle customer portal session URL */
app.get('/api/billing/portal', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!isPaddleConfigured()) {
      return c.json({ error: 'Billing is not configured' }, 503);
    }

    const customerId = await getPaddleCustomerId(auth.userId);
    if (!customerId) {
      return c.json({ error: 'No billing customer found' }, 404);
    }

    const paddle = getPaddleClient();
    const subscriptionIds: string[] = [];
    for await (const sub of paddle.subscriptions.list({ customerId: [customerId] })) {
      if (sub.id) subscriptionIds.push(sub.id);
    }

    const session = await paddle.customerPortalSessions.create(customerId, subscriptionIds);
    const url = session.urls?.general?.overview;
    if (!url) {
      console.error('[billing/portal] Unexpected portal session shape:', session);
      return c.json({ error: 'Failed to create portal session' }, 500);
    }

    return c.json({ url });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/billing/portal', action: 'create_portal_session' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/billing/sync — reconcile entitlements from Paddle API (purchase→webhook gap) */
app.post('/api/billing/sync', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const result = await syncEntitlementsFromProvider(auth.userId);
    return c.json({
      synced: true,
      updated: result.updated,
      hasSharedSpaces: result.hasSharedSpaces,
      entitlements: result.entitlements,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/billing/sync',
      action: 'sync_entitlements',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Subscription ───────────────────────────────────────────────────

/** GET /api/subscription/status */
app.get('/api/subscription/status', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!(await hasEntitlementForUserId(auth.userId, 'shared_spaces'))) {
      await syncEntitlementsFromProvider(auth.userId);
    }

    const subscriptionInfo = await getSubscriptionInfo(auth.userId, auth);

    return c.json(
      {
        hasUnlimited: subscriptionInfo.hasUnlimited,
        hasSharedSpaces: subscriptionInfo.hasSharedSpaces,
        entitlements: subscriptionInfo.entitlements,
        planKey: subscriptionInfo.planKey,
        limits: subscriptionInfo.limits,
        currentCount: subscriptionInfo.currentCount,
        limit: subscriptionInfo.limit,
        sharedSpacesOwnedCount: subscriptionInfo.sharedSpacesOwnedCount,
        sharedSpacesOwnedLimit: subscriptionInfo.sharedSpacesOwnedLimit,
      },
      200,
      { 'Cache-Control': 'private, no-store, max-age=0' }
    );
  } catch (error: any) {
    console.error('Error checking subscription status:', error);
    return c.json({ error: error.message || 'Failed to check subscription status', hasUnlimited: false }, 500);
  }
});

// ─── Referral ───────────────────────────────────────────────────────

/** POST /api/referral/credit */
app.post('/api/referral/credit', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const ref = getCookie(c, 'harvous_referrer')?.trim();

    deleteCookie(c, 'harvous_referrer', { path: '/' });

    if (!ref) return c.json({ credited: false });

    const referrerUserId = await resolveRefToUserId(ref);
    if (!referrerUserId) return c.json({ credited: false });
    if (referrerUserId === auth.userId) return c.json({ credited: false });

    const referrerRow = first(await db
      .select({ userId: UserMetadata.userId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, referrerUserId))
      .limit(1));

    if (!referrerRow) return c.json({ credited: false });

    const alreadyCredited = first(await db
      .select({ id: UserXP.id })
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, referrerUserId),
        eq(UserXP.activityType, ACTIVITY_TYPES.REFERRAL_CREDITED),
        eq(UserXP.relatedId, auth.userId)
      ))
      .limit(1));

    if (alreadyCredited) return c.json({ credited: false });

    const existingReferralAgg = first(await db
      .select({ cnt: count() })
      .from(UserXP)
      .where(and(
        eq(UserXP.userId, referrerUserId),
        eq(UserXP.activityType, ACTIVITY_TYPES.REFERRAL_CREDITED)
      )));

    const existingReferralCount = Number(existingReferralAgg?.cnt ?? 0);
    const xpAmount = getReferralCreditXpForOrdinal(existingReferralCount + 1);

    await awardXP(
      referrerUserId,
      ACTIVITY_TYPES.REFERRAL_CREDITED,
      xpAmount,
      auth.userId,
      { inviteeUserId: auth.userId }
    );

    return c.json({ credited: true });
  } catch (error) {
    console.error('Referral credit error:', error);
    return c.json({ error: 'Failed to credit referral', credited: false }, 500);
  }
});

/** GET /api/referral/status */
app.get('/api/referral/status', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const metaRow = first(await db
      .select({ referralCode: UserMetadata.referralCode, firstName: UserMetadata.firstName })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, auth.userId))
      .limit(1));

    let referralCode = metaRow?.referralCode ?? null;

    if (!referralCode) {
      referralCode = generateReferralCode(metaRow?.firstName ?? null, auth.userId);
      await db.update(UserMetadata).set({ referralCode, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
    }

    const referralRows = await db
      .select({ xpAmount: UserXP.xpAmount })
      .from(UserXP)
      .where(and(eq(UserXP.userId, auth.userId), eq(UserXP.activityType, ACTIVITY_TYPES.REFERRAL_CREDITED)));

    const referralCount = referralRows.length;
    const referralXP = referralRows.reduce((sum, row) => sum + row.xpAmount, 0);

    return c.json({ referralCount, referralXP, referralCode });
  } catch (error) {
    console.error('Referral status error:', error);
    return c.json({ error: 'Failed to load referral status' }, 500);
  }
});

export default app;
