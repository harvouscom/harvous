/**
 * Billing + Subscription + Referral routes — Hono port
 *
 * Endpoints:
 *   POST /api/billing/checkout
 *   POST /api/billing/downgrade
 *   POST /api/billing/sync-shared-spaces
 *   GET  /api/subscription/status
 *   POST /api/referral/credit
 *   GET  /api/referral/status
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, first, UserMetadata, UserXP, eq, and, count } from '../db';
import { nowISO } from '../db/dates';
import { handleAPIError } from '@/utils/error-handling';
import { SHARED_SPACES_PLAN_ID, getSubscriptionInfo } from '../utils/subscription';
import { hasSharedSpacesAddOnForUserId, syncSharedSpacesAddOnFromClerk } from '../utils/tier-limits';
import { resolveRefToUserId, generateReferralCode } from '../utils/referral-code';
import { ACTIVITY_TYPES, awardXP, getReferralCreditXpForOrdinal } from '../utils/xp-system';
import { getCookie, deleteCookie } from 'hono/cookie';

const app = new Hono();

// ─── Billing ────────────────────────────────────────────────────────

/** POST /api/billing/checkout */
app.post('/api/billing/checkout', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { planId, billingInterval } = await c.req.json();

    // Only the Shared Spaces add-on is purchasable (the Unlimited plan is retired).
    if (!planId || !SHARED_SPACES_PLAN_ID || planId !== SHARED_SPACES_PLAN_ID) {
      return c.json({ error: 'Invalid plan ID' }, 400);
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      return c.json({ error: 'Clerk secret key not configured' }, 500);
    }

    const origin = new URL(c.req.url).origin;

    const checkoutPayload: any = {
      plan_id: planId,
      return_url: `${origin}/addon?success=true`,
      cancel_url: `${origin}/addon?canceled=true`,
    };

    if (billingInterval === 'annual' || billingInterval === 'year') {
      checkoutPayload.billing_interval = 'year';
      checkoutPayload.interval = 'year';
    }

    let response = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/checkout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload),
    });

    if (!response.ok && (response.status === 404 || response.status === 405)) {
      response = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/subscriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: planId,
          ...(billingInterval === 'annual' || billingInterval === 'year' ? { billing_interval: 'year' } : {}),
        }),
      });

      if (response.ok) {
        return c.json({ success: true, message: 'Subscription created successfully' });
      }
    }

    if (response.ok) {
      const checkoutSession = await response.json();
      return c.json({ checkoutUrl: checkoutSession.url || checkoutSession.checkout_url || checkoutSession.session_url });
    }

    const errorText = await response.text();
    let errorData: any;
    try { errorData = JSON.parse(errorText); } catch { errorData = { message: errorText || `HTTP ${response.status}` }; }

    console.error('Clerk Billing API error:', { status: response.status, error: errorData });

    let errorMessage = 'Error creating checkout session';
    let hint = 'Please check Clerk Billing API documentation.';
    if (response.status === 404) { errorMessage = 'Checkout endpoint not found'; hint = 'Checkout might need frontend components.'; }
    else if (response.status === 401 || response.status === 403) { errorMessage = 'Authentication failed'; hint = 'Verify Clerk secret key.'; }

    return c.json({ error: errorMessage, details: errorData.message || errorData.error, statusCode: response.status, hint }, response.status as any);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/billing/checkout', action: 'create_checkout_session' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/billing/downgrade */
app.post('/api/billing/downgrade', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      return c.json({ error: 'Clerk secret key not configured' }, 500);
    }

    let subscriptionId: string | null = null;

    const subscriptionsResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/subscriptions`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' },
    });

    if (subscriptionsResponse.ok) {
      const subscriptionsData = await subscriptionsResponse.json();
      const activeSubscription = Array.isArray(subscriptionsData)
        ? subscriptionsData.find((sub: any) => sub.status === 'active' || sub.status === 'trialing')
        : subscriptionsData.data?.find((sub: any) => sub.status === 'active' || sub.status === 'trialing');
      if (activeSubscription) subscriptionId = activeSubscription.id || activeSubscription.subscription_id;
    }

    if (!subscriptionId) {
      return c.json({ error: 'No active subscription found', message: 'You do not have an active subscription to cancel' }, 404);
    }

    const cancelResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' },
    });

    if (cancelResponse.ok) {
      return c.json({ success: true, message: 'Subscription canceled successfully' });
    }

    const patchResponse = await fetch(`https://api.clerk.com/v1/users/${auth.userId}/billing/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${clerkSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel_at_period_end: true }),
    });

    if (patchResponse.ok) {
      return c.json({ success: true, message: 'Subscription will be canceled at the end of the billing period' });
    }

    const errorText = await patchResponse.text();
    let errorData: any;
    try { errorData = JSON.parse(errorText); } catch { errorData = { message: errorText }; }
    console.error('Clerk Billing cancel error:', { status: patchResponse.status, error: errorData });

    return c.json({ error: 'Failed to cancel subscription', details: errorData.message || errorData.error }, patchResponse.status as any);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/billing/downgrade', action: 'cancel_subscription' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/billing/sync-shared-spaces — idempotent Clerk → DB entitlement reconcile */
app.post('/api/billing/sync-shared-spaces', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const { hasSharedSpaces, updated } = await syncSharedSpacesAddOnFromClerk(auth.userId, auth);
    return c.json({ synced: true, updated, hasSharedSpaces });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/billing/sync-shared-spaces',
      action: 'sync_shared_spaces_addon',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Subscription ───────────────────────────────────────────────────

/** GET /api/subscription/status — billing tier + note stats; note `limit` is always null (unlimited notes). */
app.get('/api/subscription/status', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    // Reconcile-on-read when the DB flag is still false (post-checkout gap before webhook).
    if (!(await hasSharedSpacesAddOnForUserId(auth.userId))) {
      await syncSharedSpacesAddOnFromClerk(auth.userId, auth);
    }

    const subscriptionInfo = await getSubscriptionInfo(auth.userId, auth);

    return c.json(
      {
        hasUnlimited: subscriptionInfo.hasUnlimited,
        hasSharedSpaces: subscriptionInfo.hasSharedSpaces,
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

    // Clear cookie regardless of outcome
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
