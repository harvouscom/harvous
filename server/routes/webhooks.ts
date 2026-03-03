/**
 * Webhooks routes — Hono port
 *
 * Endpoints:
 *   POST /api/webhooks/clerk
 */

import { Hono } from 'hono';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { tagAsAppUser } from '@/utils/audienceful';
import { handleAPIError } from '@/utils/error-handling';

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

    // Verify the webhook signature
    let event: ClerkWebhookEvent;
    try {
      event = (await verifyWebhook(c.req.raw, { signingSecret: webhookSecret })) as ClerkWebhookEvent;
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

export default app;
