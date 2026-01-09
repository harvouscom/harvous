import type { APIRoute } from 'astro';
import { Webhook } from '@clerk/backend';
import { tagAsAppUser } from '@/utils/audienceful';
import { handleAPIError } from '@/utils/error-handling';
import { successResponse, errorResponse, unauthorizedResponse, serverErrorResponse } from '@/utils/api-responses';

/**
 * Clerk Webhook Endpoint
 *
 * Receives webhook notifications from Clerk when:
 * - Users are created (user.created)
 * - Users are updated (user.updated)
 * - Users are deleted (user.deleted)
 *
 * This endpoint automatically tags users in Audienceful when they sign up
 * for the Harvous app via Clerk authentication.
 *
 * Webhook Setup:
 * 1. Go to Clerk Dashboard > Webhooks
 * 2. Add a new webhook endpoint with URL: https://your-domain.com/api/webhooks/clerk
 * 3. Select events: user.created (and optionally user.updated, user.deleted)
 * 4. Copy the signing secret and add it to your .env as CLERK_WEBHOOK_SECRET
 *
 * Environment Variables Required:
 * - CLERK_WEBHOOK_SECRET: Webhook signing secret from Clerk dashboard
 * - AUDIENCEFUL_API_KEY: Audienceful API key for tagging subscribers
 */

interface ClerkUserWebhookEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted';
  data: {
    id: string;
    email_addresses: Array<{
      email_address: string;
      id: string;
      verification?: {
        status: string;
      };
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
 * Get primary email from Clerk user data
 */
function getPrimaryEmail(event: ClerkUserWebhookEvent): string | null {
  const { data } = event;

  if (!data.email_addresses || data.email_addresses.length === 0) {
    return null;
  }

  // Find primary email if specified
  if (data.primary_email_address_id) {
    const primaryEmail = data.email_addresses.find(
      (email) => email.id === data.primary_email_address_id
    );
    if (primaryEmail) {
      return primaryEmail.email_address;
    }
  }

  // Fall back to first email
  return data.email_addresses[0].email_address;
}

/**
 * Process user.created webhook event
 */
async function handleUserCreated(event: ClerkUserWebhookEvent): Promise<void> {
  const email = getPrimaryEmail(event);

  if (!email) {
    console.error('No email found for user:', event.data.id);
    throw new Error('User has no email address');
  }

  const { id: clerkUserId, first_name, last_name } = event.data;

  console.log('Processing user.created webhook:', {
    clerkUserId,
    email,
    firstName: first_name,
    lastName: last_name,
  });

  // Tag user in Audienceful
  try {
    const result = await tagAsAppUser(
      email,
      clerkUserId,
      first_name || undefined,
      last_name || undefined
    );

    console.log('Successfully tagged user in Audienceful:', {
      email,
      audiencefulId: result.id,
    });
  } catch (error: any) {
    console.error('Failed to tag user in Audienceful:', {
      email,
      error: error.message,
    });

    // Don't throw - we don't want to fail the webhook if Audienceful is down
    // The user is still created in Clerk successfully
    handleAPIError(error, {
      endpoint: '/api/webhooks/clerk',
      action: 'tag_audienceful_user',
      userId: clerkUserId,
      email,
    });
  }
}

/**
 * Process user.updated webhook event
 */
async function handleUserUpdated(event: ClerkUserWebhookEvent): Promise<void> {
  const email = getPrimaryEmail(event);

  if (!email) {
    console.log('User has no email, skipping Audienceful update:', event.data.id);
    return;
  }

  const { id: clerkUserId, first_name, last_name } = event.data;

  console.log('Processing user.updated webhook:', {
    clerkUserId,
    email,
    firstName: first_name,
    lastName: last_name,
  });

  // Update user in Audienceful (this will also tag them as app_user if not already tagged)
  try {
    await tagAsAppUser(
      email,
      clerkUserId,
      first_name || undefined,
      last_name || undefined
    );

    console.log('Successfully updated user in Audienceful:', { email });
  } catch (error: any) {
    console.error('Failed to update user in Audienceful:', {
      email,
      error: error.message,
    });

    handleAPIError(error, {
      endpoint: '/api/webhooks/clerk',
      action: 'update_audienceful_user',
      userId: clerkUserId,
      email,
    });
  }
}

/**
 * Process user.deleted webhook event
 */
async function handleUserDeleted(event: ClerkUserWebhookEvent): Promise<void> {
  // We don't delete users from Audienceful - they remain as email subscribers
  // but we could add a custom field to mark them as inactive if needed
  console.log('User deleted in Clerk:', event.data.id);

  // Optional: You could update Audienceful to mark user as inactive
  // For now, we just log it
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const webhookSecret = import.meta.env.CLERK_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('CLERK_WEBHOOK_SECRET not configured');
      return serverErrorResponse(
        new Error('Webhook secret not configured'),
        { endpoint: '/api/webhooks/clerk' }
      );
    }

    // Get the raw body and headers needed for verification
    const payload = await request.text();
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');

    // Verify all required headers are present
    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('Missing Svix headers:', {
        hasSvixId: !!svixId,
        hasSvixTimestamp: !!svixTimestamp,
        hasSvixSignature: !!svixSignature,
      });
      return unauthorizedResponse('Missing webhook signature headers');
    }

    // Verify the webhook signature using Clerk's Webhook class
    let event: ClerkUserWebhookEvent;

    try {
      const wh = new Webhook(webhookSecret);
      event = wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkUserWebhookEvent;
    } catch (error: any) {
      console.error('Webhook signature verification failed:', error.message);
      return unauthorizedResponse('Invalid webhook signature');
    }

    // Process the event based on type
    console.log('Received webhook event:', {
      type: event.type,
      userId: event.data.id,
      timestamp: event.timestamp,
    });

    switch (event.type) {
      case 'user.created':
        await handleUserCreated(event);
        break;

      case 'user.updated':
        await handleUserUpdated(event);
        break;

      case 'user.deleted':
        await handleUserDeleted(event);
        break;

      default:
        console.log('Unhandled webhook event type:', event.type);
    }

    return successResponse({
      message: 'Webhook processed successfully',
      eventType: event.type,
    });

  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return serverErrorResponse(error, {
      endpoint: '/api/webhooks/clerk',
      action: 'process_webhook',
    });
  }
};
