/**
 * Webhooks routes — Hono port
 *
 * Endpoints:
 *   POST /api/webhooks/clerk
 *   POST /api/webhooks/paddle
 */

import { Hono } from 'hono';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { tagAsAppUser } from '@/utils/audienceful';
import { handleAPIError } from '@/utils/error-handling';
import { invalidateUserCache } from '../utils/user-cache';
import { verifyPaddleSignature } from '../utils/paddle-signature';
import { firstHeaderValue } from '../utils/paddle-client';
import {
  applyPaddleSubscriptionEntitlement,
  setPaddleCustomerId,
  getPaddleCustomerId,
} from '../utils/entitlements';
import { planForPriceId } from '@/lib/billing-plans';
import { db, first, UserMetadata, eq } from '../db';

const app = new Hono();

// ─── Types ────────────────────────────────────────────────────────────

interface ClerkUserWebhookEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted';
  data: {
    id: string;
    email_addresses: Array<{
      email_address: string;
      id: string;
      verification?: { status: string };
    }>;
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    created_at?: number;
    updated_at?: number;
    [key: string]: any;
  };
  object: 'event';
  timestamp?: number;
}

interface ClerkEmailWebhookEvent {
  type: 'emailAddress.created';
  data: {
    id: string;
    email_address: string;
    user_id: string;
    verification?: { status: string };
    [key: string]: any;
  };
  object: 'event';
  timestamp?: number;
}

type ClerkWebhookEvent = ClerkUserWebhookEvent | ClerkEmailWebhookEvent;

// ─── Helpers ──────────────────────────────────────────────────────────

const SVIX_HEADER_NAMES = ['svix-id', 'svix-timestamp', 'svix-signature'] as const;

/**
 * Netlify's proxy can duplicate individual headers, which Fetch's Headers.get()
 * then joins with ", " (e.g. "msg_abc, msg_abc"). Same class of bug already
 * worked around for Authorization in middleware/auth.ts — here it corrupts the
 * exact string Clerk's webhook library hashes (id.timestamp.body), so every
 * signature check fails with "No matching signature found" even with the
 * correct secret. Rebuild the request with de-duplicated svix-* headers before
 * verifying. Safe to split on ", " (not bare ","): svix-signature's own format
 * uses "v1,<sig>" (no space) with a plain space between multiple signatures,
 * so a genuine header value never legitimately contains ", ".
 */
async function dedupeSvixHeaders(req: Request): Promise<Request> {
  const headers = new Headers(req.headers);
  let sawDuplicate = false;

  for (const name of SVIX_HEADER_NAMES) {
    const value = headers.get(name);
    if (value?.includes(', ')) {
      sawDuplicate = true;
      headers.set(name, value.split(', ')[0]);
    }
  }

  if (!sawDuplicate) return req;

  const body = await req.clone().arrayBuffer();
  return new Request(req.url, { method: req.method, headers, body });
}

function getPrimaryEmail(event: ClerkUserWebhookEvent): string | null {
  const { data } = event;
  if (!data.email_addresses || data.email_addresses.length === 0) return null;

  if (data.primary_email_address_id) {
    const primaryEmail = data.email_addresses.find((email) => email.id === data.primary_email_address_id);
    if (primaryEmail) return primaryEmail.email_address;
  }

  return data.email_addresses[0].email_address;
}

async function handleEmailCreated(event: ClerkEmailWebhookEvent): Promise<void> {
  try {
    console.log(`[Webhook] Processing ${event.type} event`);

    if (!event.data) throw new Error('Event data is missing');

    const email_address = event.data.email_address;
    const user_id = event.data.user_id;

    if (!email_address) {
      console.error('[Webhook] Event missing email_address');
      return;
    }
    if (!user_id) {
      console.error('[Webhook] Event missing user_id');
      return;
    }

    try {
      const { createClerkClient } = await import('@clerk/backend');
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;

      if (!clerkSecretKey) {
        console.error('[Webhook] CLERK_SECRET_KEY not configured');
        await tagAsAppUser(email_address, user_id);
        return;
      }

      const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
      const user = await clerkClient.users.getUser(user_id);
      const firstName = user.firstName || undefined;
      const lastName = user.lastName || undefined;

      try {
        const result = await tagAsAppUser(email_address, user_id, firstName, lastName);
        console.log('[Webhook] Tagged user in Audienceful (emailAddress.created):', {
          email: email_address,
          clerkUserId: user_id,
          audiencefulId: result.id || result.uid,
        });
      } catch (error: any) {
        console.error('[Webhook] Failed to tag user in Audienceful (emailAddress.created):', error.message);
        handleAPIError(error, { endpoint: '/api/webhooks/clerk', action: 'tag_audienceful_user', userId: user_id, email: email_address });
      }
    } catch (error: any) {
      console.error('[Webhook] Failed to fetch user details from Clerk:', error.message);
      try {
        await tagAsAppUser(email_address, user_id);
        console.log('[Webhook] Tagged user in Audienceful (fallback, no name)');
      } catch (audiencefulError: any) {
        console.error('[Webhook] Failed to tag user in Audienceful (fallback):', audiencefulError.message);
        handleAPIError(audiencefulError, { endpoint: '/api/webhooks/clerk', action: 'tag_audienceful_user_fallback', userId: user_id, email: email_address });
      }
    }
  } catch (error: any) {
    console.error('[Webhook] Error in handleEmailCreated:', error.message);
    throw error;
  }
}

async function handleUserCreated(event: ClerkUserWebhookEvent): Promise<void> {
  const { id: clerkUserId, first_name, last_name } = event.data;
  const email = getPrimaryEmail(event);

  console.log('[Webhook] Processing user.created event:', { clerkUserId, email: email || 'NO_EMAIL' });

  if (!email) {
    console.warn('[Webhook] User has no email address, skipping Audienceful sync');
    return;
  }

  try {
    const result = await tagAsAppUser(email, clerkUserId, first_name || undefined, last_name || undefined);
    console.log('[Webhook] Tagged user in Audienceful:', { email, clerkUserId, audiencefulId: result.id || result.uid });
  } catch (error: any) {
    console.error('[Webhook] Failed to tag user in Audienceful:', error.message);
    handleAPIError(error, { endpoint: '/api/webhooks/clerk', action: 'tag_audienceful_user', userId: clerkUserId, email });
  }
}

async function handleUserUpdated(event: ClerkUserWebhookEvent): Promise<void> {
  const { id: clerkUserId, first_name, last_name } = event.data;
  const email = getPrimaryEmail(event);

  console.log('[Webhook] Processing user.updated event:', { clerkUserId, email: email || 'NO_EMAIL' });

  try {
    await invalidateUserCache(clerkUserId);
  } catch (cacheError: unknown) {
    const message = cacheError instanceof Error ? cacheError.message : String(cacheError);
    console.warn('[Webhook] Failed to invalidate user cache after user.updated:', { clerkUserId, message });
  }

  if (!email) {
    console.log('[Webhook] User has no email, skipping Audienceful update');
    return;
  }

  try {
    const result = await tagAsAppUser(email, clerkUserId, first_name || undefined, last_name || undefined);
    console.log('[Webhook] Updated user in Audienceful:', { email, clerkUserId, audiencefulId: result.id || result.uid });
  } catch (error: any) {
    console.error('[Webhook] Failed to update user in Audienceful:', error.message);
    handleAPIError(error, { endpoint: '/api/webhooks/clerk', action: 'update_audienceful_user', userId: clerkUserId, email });
  }
}

async function handleUserDeleted(event: ClerkUserWebhookEvent): Promise<void> {
  console.log('User deleted in Clerk:', event.data.id);
}

// ─── POST /api/webhooks/clerk ─────────────────────────────────────────

app.post('/api/webhooks/clerk', async (c) => {
  const startTime = Date.now();

  try {
    console.log('[Webhook] Webhook request received:', {
      method: c.req.method,
      url: c.req.url,
      headers: {
        'svix-id': c.req.header('svix-id') || 'MISSING',
        'svix-timestamp': c.req.header('svix-timestamp') || 'MISSING',
        'svix-signature': c.req.header('svix-signature') ? 'PRESENT' : 'MISSING',
      },
    });

    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Webhook] CLERK_WEBHOOK_SECRET not configured');
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }

    const audiencefulKey = process.env.AUDIENCEFUL_API_KEY;
    if (!audiencefulKey) {
      console.warn('[Webhook] AUDIENCEFUL_API_KEY not configured');
    }

    // Verify the webhook signature (after stripping Netlify's occasional header duplication)
    let event: ClerkWebhookEvent;
    try {
      const cleanedRequest = await dedupeSvixHeaders(c.req.raw);
      event = (await verifyWebhook(cleanedRequest, { signingSecret: webhookSecret })) as ClerkWebhookEvent;
      console.log('[Webhook] Signature verification successful:', { eventType: event.type });
    } catch (error: any) {
      console.error('[Webhook] Signature verification failed:', error.message);
      return c.json({ error: 'Invalid webhook signature' }, 401);
    }

    // Extract userId for logging
    let userId: string;
    try {
      if (event.type === 'emailAddress.created') {
        userId = (event as ClerkEmailWebhookEvent).data.user_id || '';
      } else {
        userId = (event as ClerkUserWebhookEvent).data.id || '';
      }
    } catch (error: any) {
      console.error('[Webhook] Error extracting userId:', error.message);
      throw error;
    }

    console.log('[Webhook] Received event:', { type: event.type, userId });

    // Process the event
    try {
      switch (event.type) {
        case 'emailAddress.created':
          await handleEmailCreated(event as ClerkEmailWebhookEvent);
          break;
        case 'user.created':
          await handleUserCreated(event as ClerkUserWebhookEvent);
          break;
        case 'user.updated':
          await handleUserUpdated(event as ClerkUserWebhookEvent);
          break;
        case 'user.deleted':
          await handleUserDeleted(event as ClerkUserWebhookEvent);
          break;
        default:
          console.log('[Webhook] Unhandled event type:', (event as any).type);
      }
    } catch (error: any) {
      console.error('[Webhook] Error processing event (webhook will still succeed):', {
        eventType: event.type,
        error: error.message,
      });

      let errorUserId: string;
      try {
        if (event.type === 'emailAddress.created') {
          errorUserId = (event as ClerkEmailWebhookEvent).data?.user_id || 'unknown';
        } else {
          errorUserId = (event as ClerkUserWebhookEvent).data?.id || 'unknown';
        }
      } catch (_extractError) {
        errorUserId = 'unknown';
      }

      handleAPIError(error, { endpoint: '/api/webhooks/clerk', action: `process_${event.type}`, userId: errorUserId });
    }

    // Always return success to Clerk
    const duration = Date.now() - startTime;
    console.log('[Webhook] Complete:', { eventType: event.type, durationMs: duration });

    return c.json({ message: 'Webhook processed successfully', eventType: event.type });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[Webhook] Error in webhook processing:', { error: error.message, durationMs: duration });

    if (error.message?.includes('signature') || error.message?.includes('Unauthorized')) {
      return c.json({ error: error.message || 'Invalid webhook signature' }, 401);
    }

    return c.json({ error: 'Internal server error', message: error?.message || 'An unexpected error occurred' }, 500);
  }
});

// ─── POST /api/webhooks/paddle ────────────────────────────────────────

type PaddleWebhookEvent = {
  event_id?: string;
  event_type?: string;
  data?: {
    id?: string;
    status?: string;
    customer_id?: string;
    custom_data?: { clerkUserId?: string } | null;
    items?: Array<{ price?: { id?: string }; price_id?: string }>;
    subscription_id?: string | null;
    [key: string]: unknown;
  };
};

async function resolveClerkUserIdFromPaddle(data: PaddleWebhookEvent['data']): Promise<string | null> {
  if (!data) return null;
  const fromCustom = data.custom_data?.clerkUserId;
  if (fromCustom) return fromCustom;

  const customerId = data.customer_id;
  if (!customerId) return null;

  const byCustomer = first(
    await db
      .select({ userId: UserMetadata.userId })
      .from(UserMetadata)
      .where(eq(UserMetadata.paddleCustomerId, customerId))
      .limit(1),
  );
  return byCustomer?.userId ?? null;
}

function priceIdFromPaddleData(data: PaddleWebhookEvent['data']): string | null {
  if (!data?.items?.length) return null;
  const item = data.items[0];
  return item?.price?.id ?? item?.price_id ?? null;
}

app.post('/api/webhooks/paddle', async (c) => {
  try {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[Paddle webhook] PADDLE_WEBHOOK_SECRET not configured');
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }

    const rawBody = await c.req.text();
    const signature = firstHeaderValue(c.req.header('paddle-signature') ?? c.req.header('Paddle-Signature'));

    if (!verifyPaddleSignature(rawBody, signature, secret)) {
      console.error('[Paddle webhook] Signature verification failed');
      return c.json({ error: 'Invalid webhook signature' }, 401);
    }

    const event = JSON.parse(rawBody) as PaddleWebhookEvent;
    const eventType = event.event_type || '';
    const data = event.data;
    console.log('[Paddle webhook] Received:', { eventType, eventId: event.event_id });

    const userId = await resolveClerkUserIdFromPaddle(data);
    if (!userId) {
      console.warn('[Paddle webhook] Could not resolve clerk user id', { eventType, customerId: data?.customer_id });
      return c.json({ ok: true, skipped: true });
    }

    if (data?.customer_id) {
      const existing = await getPaddleCustomerId(userId);
      if (!existing) await setPaddleCustomerId(userId, data.customer_id);
    }

    const priceId = priceIdFromPaddleData(data);
    const subscriptionId = data?.id?.startsWith('sub_') ? data.id : data?.subscription_id ?? null;

    switch (eventType) {
      case 'subscription.activated':
      case 'subscription.updated':
      case 'transaction.completed': {
        const enabled =
          eventType === 'transaction.completed'
            ? Boolean(priceId && planForPriceId(priceId))
            : data?.status === 'active' || data?.status === 'trialing' || data?.status === 'past_due';
        if (priceId && planForPriceId(priceId)) {
          await applyPaddleSubscriptionEntitlement({
            userId,
            priceId,
            subscriptionId,
            enabled: enabled || eventType === 'subscription.activated',
          });
        }
        break;
      }
      case 'subscription.canceled': {
        await applyPaddleSubscriptionEntitlement({
          userId,
          priceId,
          subscriptionId,
          enabled: false,
        });
        break;
      }
      case 'subscription.past_due': {
        // Keep entitlement during past_due (dunning); status stays active in our model.
        if (priceId && planForPriceId(priceId)) {
          await applyPaddleSubscriptionEntitlement({
            userId,
            priceId,
            subscriptionId,
            enabled: true,
          });
        }
        break;
      }
      default:
        console.log('[Paddle webhook] Unhandled event type:', eventType);
    }

    return c.json({ ok: true });
  } catch (error: any) {
    console.error('[Paddle webhook] Error:', error?.message || error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
