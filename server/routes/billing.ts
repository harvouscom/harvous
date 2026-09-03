/**
 * Billing + Subscription + Referral routes — Hono port
 *
 * Endpoints:
 *   POST /api/billing/checkout
 *   GET  /api/billing/portal
 *   GET  /api/billing/manage
 *   GET  /api/billing/orders/:orderId/receipt
 *   POST /api/billing/cancel
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
import { syncEntitlementsFromProvider, getFoundingAvailability } from '../utils/entitlements';
import { getPolarClient, isPolarConfigured } from '../utils/polar-client';
import {
  getPolarBillingManage,
  getPolarOrderDocumentUrl,
  setPolarCancelAtPeriodEnd,
} from '../utils/polar-billing';
import {
  foundingOffer,
  listedPlans,
  planFor,
  type PlanInterval,
  type PlanKey,
} from '@/lib/billing-plans';
import { resolveRefToUserId, generateReferralCode } from '../utils/referral-code';
import { ACTIVITY_TYPES, awardXP, getReferralCreditXpForOrdinal } from '../utils/xp-system';
import { getCookie, deleteCookie } from 'hono/cookie';
import { getPublicAppOrigin } from '../utils/public-app-origin';

const app = new Hono();

// ─── Billing ────────────────────────────────────────────────────────

/**
 * GET /api/billing/plans — public pricing payload for /upgrade.
 *
 * Founding availability is a live count, so the client cannot hardcode it; the
 * same check is repeated server-side at checkout (a stale page must not be able
 * to claim slot 100).
 */
app.get('/api/billing/plans', async (c) => {
  try {
    const founding = await getFoundingAvailability();
    const offer = foundingOffer();
    const plans = listedPlans().map((plan) => ({
      key: plan.key,
      name: plan.name,
      interval: plan.interval,
      amountCents: plan.amountCents,
      currencyCode: plan.currencyCode,
      productId: plan.productId,
      /**
       * Founding is a discount on this row, not a row of its own, so annual
       * carries a first-year price while seats remain. Every plan stays
       * `available` — selling out changes the price shown, not the shelf.
       */
      founding: Boolean(offer && plan.productId === offer.plan.productId && founding.available),
      foundingFirstYearCents:
        offer && plan.productId === offer.plan.productId && founding.available
          ? offer.firstYearCents
          : null,
      available: true,
    }));
    return c.json({ plans, founding }, 200, { 'Cache-Control': 'public, max-age=30' });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/billing/plans', action: 'list_plans' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * POST /api/billing/checkout — create a Polar checkout session for the chosen
 * product and return its hosted checkout URL (client redirects). The customer
 * is keyed by `externalCustomerId` = Clerk userId, so no pre-created customer
 * is needed.
 *
 * Accepts `{ productId }` (preferred) or `{ plan, interval }`. Legacy callers
 * sending only `{ interval }` still resolve to standard Plus.
 */
app.post('/api/billing/checkout', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!isPolarConfigured()) {
      return c.json({ error: 'Billing is not configured' }, 503);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      interval?: PlanInterval | 'annual';
      plan?: PlanKey;
      productId?: string;
      founding?: boolean;
    };

    const interval: PlanInterval = body.interval === 'month' ? 'month' : 'year';
    const planKey: PlanKey = body.plan === 'connector' ? 'connector' : 'plus';

    const allowed = new Set(listedPlans().map((p) => p.productId));

    let productId: string | undefined;
    if (body.productId && allowed.has(body.productId)) {
      productId = body.productId;
    } else {
      productId = planFor(planKey, interval)?.productId;
    }

    if (!productId || !allowed.has(productId)) {
      return c.json({ error: 'Invalid or unconfigured plan product' }, 400);
    }

    // Founding is a discount on the annual product, not a product of its own,
    // so it rides the same checkout. Re-check the cap server-side: the page may
    // have been open since before the last slot went.
    const offer = foundingOffer();
    let discountId: string | undefined;
    if (body.founding && planKey === 'plus' && offer && productId === offer.plan.productId) {
      const founding = await getFoundingAvailability();
      if (!founding.available) {
        return c.json(
          {
            error: 'The founding price is fully claimed.',
            code: 'FOUNDING_SOLD_OUT',
            founding,
          },
          409,
        );
      }
      discountId = offer.discountId;
    }

    const meta = first(
      await db
        .select({ email: UserMetadata.email })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, auth.userId))
        .limit(1),
    );

    // SPA origin (not API :3001) — Vite proxy would otherwise send Polar back to the API host → 404.
    const origin = getPublicAppOrigin(c);
    const polar = getPolarClient();
    const checkout = await polar.checkouts.create({
      products: [productId],
      ...(discountId ? { discountId } : {}),
      externalCustomerId: auth.userId,
      ...(meta?.email?.includes('@') ? { customerEmail: meta.email } : {}),
      // Hosted Polar checkout; return to /upgrade (legacy /addon redirects preserve query).
      successUrl: `${origin}/upgrade?checkout_id={CHECKOUT_ID}`,
      metadata: { clerkUserId: auth.userId },
    });

    const resolved = listedPlans().find((p) => p.productId === productId);

    return c.json({
      url: checkout.url,
      interval: resolved?.interval ?? interval,
      plan: resolved?.key ?? planKey,
      founding: Boolean(discountId),
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/billing/checkout', action: 'create_checkout_session' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** GET /api/billing/portal — Polar hosted portal (payment method / invoices only). */
app.get('/api/billing/portal', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!isPolarConfigured()) {
      return c.json({ error: 'Billing is not configured' }, 503);
    }

    const polar = getPolarClient();
    let session;
    try {
      session = await polar.customerSessions.create({ externalCustomerId: auth.userId });
    } catch {
      // No Polar customer yet (never purchased) → nothing to manage.
      return c.json({ error: 'No billing customer found' }, 404);
    }

    if (!session.customerPortalUrl) {
      console.error('[billing/portal] Unexpected portal session shape:', session);
      return c.json({ error: 'Failed to create portal session' }, 500);
    }

    return c.json({ url: session.customerPortalUrl });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/billing/portal', action: 'create_portal_session' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * GET /api/billing/manage — in-app Settings › Plan payload (sub + card + orders).
 * 404 when the user has no Polar-managed Plus subscription.
 */
app.get('/api/billing/manage', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!isPolarConfigured()) {
      return c.json({ error: 'Billing is not configured' }, 503);
    }

    const manage = await getPolarBillingManage(auth.userId);
    if (!manage) {
      return c.json({ error: 'No active subscription found' }, 404);
    }

    return c.json(manage, 200, { 'Cache-Control': 'private, no-store, max-age=0' });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/billing/manage', action: 'load_billing_manage' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * GET /api/billing/orders/:orderId/receipt — presigned receipt/invoice URL for this user.
 */
app.get('/api/billing/orders/:orderId/receipt', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orderId = c.req.param('orderId')?.trim();
    if (!orderId) {
      return c.json({ error: 'Order id is required' }, 400);
    }

    if (!isPolarConfigured()) {
      return c.json({ error: 'Billing is not configured' }, 503);
    }

    const url = await getPolarOrderDocumentUrl(auth.userId, orderId);
    return c.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load receipt';
    if (message === 'Order not found' || message === 'Receipt unavailable for this order') {
      return c.json({ error: message }, message === 'Order not found' ? 404 : 404);
    }
    if (message === 'Billing is not configured') {
      return c.json({ error: message }, 503);
    }
    const standardError = handleAPIError(error, {
      endpoint: '/api/billing/orders/:orderId/receipt',
      action: 'get_order_receipt',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * POST /api/billing/cancel — schedule cancel at period end, or resume.
 * Body: `{ cancelAtPeriodEnd: boolean }`. Does not clear Entitlements.
 */
app.post('/api/billing/cancel', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!isPolarConfigured()) {
      return c.json({ error: 'Billing is not configured' }, 503);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      cancelAtPeriodEnd?: boolean;
      plan?: PlanKey;
    };
    if (typeof body.cancelAtPeriodEnd !== 'boolean') {
      return c.json({ error: 'cancelAtPeriodEnd (boolean) is required' }, 400);
    }

    // Defaults to Plus; Connector must be named explicitly so a Connector cancel
    // can never take down someone's Plus subscription.
    const planKey: PlanKey = body.plan === 'connector' ? 'connector' : 'plus';
    const billing = await setPolarCancelAtPeriodEnd(auth.userId, body.cancelAtPeriodEnd, planKey);
    return c.json({ billing, plan: planKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update subscription';
    if (message === 'No active subscription found') {
      return c.json({ error: message }, 404);
    }
    if (message === 'Billing is not configured') {
      return c.json({ error: message }, 503);
    }
    const standardError = handleAPIError(error, { endpoint: '/api/billing/cancel', action: 'cancel_subscription' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/billing/sync — reconcile entitlements from the Polar API (purchase→webhook gap) */
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

    // Bidirectional reconcile: promote after checkout gaps, demote when Polar
    // no longer has an active subscription (e.g. customer deleted in dashboard).
    // Throttled — this endpoint is read on every session and refetched on focus; webhooks
    // are the primary path. POST /api/billing/sync stays unthrottled for explicit syncs.
    await syncEntitlementsFromProvider(auth.userId, { throttle: true });

    const subscriptionInfo = await getSubscriptionInfo(auth.userId, auth);

    return c.json(
      {
        hasUnlimited: subscriptionInfo.hasUnlimited,
        hasSharedSpaces: subscriptionInfo.hasSharedSpaces,
        hasConnector: subscriptionInfo.hasConnector,
        isFounding: subscriptionInfo.isFounding,
        entitlements: subscriptionInfo.entitlements,
        planKey: subscriptionInfo.planKey,
        canManageBilling: subscriptionInfo.canManageBilling,
        billing: subscriptionInfo.billing,
        connectorBilling: subscriptionInfo.connectorBilling,
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
    // Never return `error.message` here: for a DrizzleQueryError that string is the raw SQL
    // plus params, and the client reports 5xx bodies to the anonymous diagnostics endpoint.
    // handleAPIError logs the unwrapped driver error (incl. `cause`) server-side instead.
    handleAPIError(error, { endpoint: '/api/subscription/status', action: 'check_subscription_status' });
    return c.json(
      { error: 'Failed to check subscription status', code: 'SUBSCRIPTION_STATUS_UNAVAILABLE', hasUnlimited: false },
      500,
    );
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
