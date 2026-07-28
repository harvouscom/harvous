/**
 * Webhooks routes — Hono port
 *
 * Endpoints:
 *   POST /api/webhooks/clerk
 *   POST /api/webhooks/polar
 */

import { Hono } from 'hono';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import { tagAsAppUser } from '@/utils/audienceful';
import { handleAPIError } from '@/utils/error-handling';
import { invalidateUserCache } from '../utils/user-cache';
import { firstHeaderValue } from '../utils/polar-client';
import {
  polarBillingIntent,
  productIdFromPolarData,
  externalUserIdFromPolarData,
  customerIdFromPolarData,
  subscriptionStatusFromPolarData,
} from '../utils/polar-webhook';
import {
  applyPolarSubscriptionEntitlement,
  setPolarCustomerId,
  getPolarCustomerId,
} from '../utils/entitlements';
import { planForProductId } from '@/lib/billing-plans';
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

/**
 * Legacy Clerk event (older instances). Prefer user.created / user.updated —
 * current Clerk event catalogs no longer list emailAddress.created.
 */
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

function activityFromClerkUserData(data: ClerkUserWebhookEvent['data']) {
  return {
    signedUpAt: data.created_at ?? null,
    lastSignInAt: data.last_sign_in_at ?? null,
    lastActiveAt: data.last_active_at ?? data.updated_at ?? null,
  };
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
  console.log(`[Webhook] Processing ${event.type} event`);

  if (!event.data) throw new Error('Event data is missing');

  const email_address = event.data.email_address;
  const user_id = event.data.user_id;

  if (!email_address) {
    console.warn('[Webhook] Event missing email_address, skipping Audienceful sync');
    return;
  }
  if (!user_id) {
    console.error('[Webhook] Event missing user_id');
    throw new Error('Event missing user_id');
  }

  let firstName: string | undefined;
  let lastName: string | undefined;
  let activity:
    | {
        signedUpAt: number | null;
        lastSignInAt: number | null;
        lastActiveAt: number | null;
      }
    | undefined;

  try {
    const { createClerkClient } = await import('@clerk/backend');
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;

    if (clerkSecretKey) {
      const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
      const user = await clerkClient.users.getUser(user_id);
      firstName = user.firstName || undefined;
      lastName = user.lastName || undefined;
      activity = {
        signedUpAt: user.createdAt ?? null,
        lastSignInAt: user.lastSignInAt ?? null,
        lastActiveAt: user.lastActiveAt ?? user.updatedAt ?? null,
      };
    } else {
      console.warn('[Webhook] CLERK_SECRET_KEY not configured; syncing without name');
    }
  } catch (error: any) {
    console.warn('[Webhook] Failed to fetch user details from Clerk; syncing without name:', error.message);
  }

  try {
    const result = await tagAsAppUser(email_address, user_id, firstName, lastName, activity);
    console.log('[Webhook] Tagged user in Audienceful (emailAddress.created):', {
      email: email_address,
      clerkUserId: user_id,
      audiencefulId: result.id || result.uid,
    });
  } catch (error: any) {
    console.error('[Webhook] Failed to tag user in Audienceful (emailAddress.created):', error.message);
    handleAPIError(error, {
      endpoint: '/api/webhooks/clerk',
      action: 'tag_audienceful_user',
      userId: user_id,
      email: email_address,
    });
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
    const result = await tagAsAppUser(
      email,
      clerkUserId,
      first_name || undefined,
      last_name || undefined,
      activityFromClerkUserData(event.data),
    );
    console.log('[Webhook] Tagged user in Audienceful:', { email, clerkUserId, audiencefulId: result.id || result.uid });
  } catch (error: any) {
    console.error('[Webhook] Failed to tag user in Audienceful:', error.message);
    handleAPIError(error, { endpoint: '/api/webhooks/clerk', action: 'tag_audienceful_user', userId: clerkUserId, email });
    throw error;
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
    const result = await tagAsAppUser(
      email,
      clerkUserId,
      first_name || undefined,
      last_name || undefined,
      activityFromClerkUserData(event.data),
    );
    console.log('[Webhook] Updated user in Audienceful:', { email, clerkUserId, audiencefulId: result.id || result.uid });
  } catch (error: any) {
    console.error('[Webhook] Failed to update user in Audienceful:', error.message);
    handleAPIError(error, { endpoint: '/api/webhooks/clerk', action: 'update_audienceful_user', userId: clerkUserId, email });
    throw error;
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

    if (!process.env.AUDIENCEFUL_API_KEY) {
      console.error('[Webhook] AUDIENCEFUL_API_KEY not configured');
      return c.json({ error: 'Audienceful API key not configured' }, 500);
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

    // Process the event. Audienceful failures return 5xx so Clerk retries.
    // Intentional skips (no email) still return 200.
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
      console.error('[Webhook] Error processing event (returning 500 for Clerk retry):', {
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
      return c.json(
        { error: 'Audienceful sync failed', message: error?.message || 'Sync failed', eventType: event.type },
        500
      );
    }

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

// ─── POST /api/webhooks/polar ─────────────────────────────────────────

app.post('/api/webhooks/polar', async (c) => {
  try {
    const secret = process.env.POLAR_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[Polar webhook] POLAR_WEBHOOK_SECRET not configured');
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }

    const rawBody = await c.req.text();
    // Standard Webhooks headers; Netlify may duplicate as "v, v" — take the first.
    const headers: Record<string, string> = {
      'webhook-id': firstHeaderValue(c.req.header('webhook-id')) ?? '',
      'webhook-timestamp': firstHeaderValue(c.req.header('webhook-timestamp')) ?? '',
      'webhook-signature': firstHeaderValue(c.req.header('webhook-signature')) ?? '',
    };

    let event: { type: string; data: unknown };
    try {
      event = validateEvent(rawBody, headers, secret) as { type: string; data: unknown };
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        console.error('[Polar webhook] Signature verification failed');
        return c.json({ error: 'Invalid webhook signature' }, 401);
      }
      throw error;
    }

    const eventType = event.type;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = event.data as any;
    console.log('[Polar webhook] Received:', { eventType });

    const intent = polarBillingIntent(eventType, subscriptionStatusFromPolarData(data));
    if (!intent) {
      return c.json({ ok: true, skipped: true });
    }

    const userId = externalUserIdFromPolarData(data);
    if (!userId) {
      console.warn('[Polar webhook] Could not resolve user id (no external_customer_id)', { eventType });
      return c.json({ ok: true, skipped: true });
    }

    // Opportunistically store the Polar customer id for fallback/audit.
    const customerId = customerIdFromPolarData(data);
    if (customerId) {
      const existing = await getPolarCustomerId(userId);
      if (!existing) await setPolarCustomerId(userId, customerId);
    }

    const productId = productIdFromPolarData(data);
    const subscriptionId = typeof data?.id === 'string' ? data.id : null;

    if (intent === 'enable') {
      if (productId && planForProductId(productId)) {
        await applyPolarSubscriptionEntitlement({ userId, productId, subscriptionId, enabled: true });
      }
    } else {
      // disable — clear this product's rows, or all billing rows if no product on the event.
      await applyPolarSubscriptionEntitlement({ userId, productId, subscriptionId, enabled: false });
    }

    return c.json({ ok: true });
  } catch (error: any) {
    console.error('[Polar webhook] Error:', error?.message || error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
