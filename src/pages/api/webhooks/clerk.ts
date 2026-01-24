import type { APIRoute } from 'astro';
import { Webhook } from '@clerk/backend';
import { tagAsAppUser } from '@/utils/audienceful';
import { handleAPIError } from '@/utils/error-handling';
import { successResponse, errorResponse, unauthorizedResponse, serverErrorResponse } from '@/utils/api-responses';

/**
 * Clerk Webhook Endpoint
 *
 * Receives webhook notifications from Clerk when:
 * - Email addresses are created (emailAddress.created) - PRIMARY EVENT for new signups
 * - Users are created (user.created) - Fallback event
 * - Users are updated (user.updated)
 * - Users are deleted (user.deleted)
 *
 * This endpoint automatically tags users in Audienceful when they sign up
 * for the Harvous app via Clerk authentication.
 *
 * IMPORTANT: We handle both emailAddress.created and user.created events.
 * user.created is the PRIMARY event (available in Clerk dashboard).
 * emailAddress.created may not be available in all Clerk instances.
 *
 * Webhook Setup:
 * 1. Go to Clerk Dashboard > Webhooks
 * 2. Add a new webhook endpoint with URL: https://your-domain.com/api/webhooks/clerk
 * 3. Select events: user.created (REQUIRED) - this is what's available in the dashboard
 * 4. Copy the signing secret and add it to your .env as CLERK_WEBHOOK_SECRET
 *
 * Environment Variables Required:
 * - CLERK_WEBHOOK_SECRET: Webhook signing secret from Clerk dashboard
 * - CLERK_SECRET_KEY: Clerk secret key (for fetching user details in emailAddress.created handler)
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

interface ClerkEmailWebhookEvent {
  type: 'emailAddress.created';
  data: {
    id: string; // email address ID
    email_address: string;
    user_id: string; // Clerk user ID
    verification?: {
      status: string;
    };
    [key: string]: any;
  };
  object: 'event';
  timestamp?: number;
}

type ClerkWebhookEvent = ClerkUserWebhookEvent | ClerkEmailWebhookEvent;

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
 * Process emailAddress.created webhook event
 * This is MORE RELIABLE than user.created because it fires when the email is actually created
 */
async function handleEmailCreated(event: ClerkEmailWebhookEvent): Promise<void> {
  try {
    // Log the full event structure first to debug
    console.log(`[Webhook] Processing ${event.type} event - full event data:`, {
      eventType: event.type,
      fullEvent: JSON.stringify(event, null, 2),
      timestamp: new Date().toISOString(),
    });

    // Extract email and user_id from emailAddress.created event
    if (!event.data) {
      throw new Error('Event data is missing');
    }
    
    const email_address = event.data.email_address;
    const user_id = event.data.user_id;

    console.log(`[Webhook] Extracted data from ${event.type} event:`, {
      clerkUserId: user_id,
      email: email_address,
      eventType: event.type,
      timestamp: new Date().toISOString(),
    });

    // Validate we have required data
    if (!email_address) {
      console.error('[Webhook] Event missing email_address:', {
        eventType: event.type,
        eventData: JSON.stringify(event.data),
      });
      // Don't throw - just log and return (webhook should still succeed)
      return;
    }

    if (!user_id) {
      console.error('[Webhook] Event missing user_id:', {
        eventType: event.type,
        eventData: JSON.stringify(event.data),
      });
      // Don't throw - just log and return (webhook should still succeed)
      return;
    }

    // Fetch full user data from Clerk to get name and other details
    try {
      const { createClerkClient } = await import('@clerk/backend');
      const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;

      if (!clerkSecretKey) {
        console.error('[Webhook] CLERK_SECRET_KEY not configured, cannot fetch user details');
        // Still try to sync with just email
        await tagAsAppUser(email_address, user_id);
        return;
      }

      const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
      const user = await clerkClient.users.getUser(user_id);

      const firstName = user.firstName || undefined;
      const lastName = user.lastName || undefined;

      console.log('[Webhook] Fetched user details from Clerk:', {
        clerkUserId: user_id,
        email: email_address,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      // Tag user in Audienceful with full details
      try {
        const result = await tagAsAppUser(
          email_address,
          user_id,
          firstName,
          lastName
        );

        console.log('[Webhook] Successfully tagged user in Audienceful (from emailAddress.created):', {
          email: email_address,
          clerkUserId: user_id,
          audiencefulId: result.id || result.uid,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error('[Webhook] Failed to tag user in Audienceful (from emailAddress.created):', {
          email: email_address,
          clerkUserId: user_id,
          error: error.message,
          errorStack: error.stack,
          timestamp: new Date().toISOString(),
        });

        handleAPIError(error, {
          endpoint: '/api/webhooks/clerk',
          action: 'tag_audienceful_user',
          userId: user_id,
          email: email_address,
        });
      }
    } catch (error: any) {
      console.error('[Webhook] Failed to fetch user details from Clerk:', {
        clerkUserId: user_id,
        email: email_address,
        error: error.message,
      });

      // Fallback: try to sync with just email (no name)
      try {
        await tagAsAppUser(email_address, user_id);
        console.log('[Webhook] Successfully tagged user in Audienceful (fallback, no name):', {
          email: email_address,
          clerkUserId: user_id,
        });
      } catch (audiencefulError: any) {
        console.error('[Webhook] Failed to tag user in Audienceful (fallback):', {
          email: email_address,
          clerkUserId: user_id,
          error: audiencefulError.message,
        });

        handleAPIError(audiencefulError, {
          endpoint: '/api/webhooks/clerk',
          action: 'tag_audienceful_user_fallback',
          userId: user_id,
          email: email_address,
        });
      }
    }
  } catch (error: any) {
    // Catch any errors in the handler itself
    console.error('[Webhook] Error in handleEmailCreated:', {
      error: error.message,
      errorStack: error.stack,
      errorName: error.name,
      eventData: JSON.stringify(event.data).substring(0, 500),
      timestamp: new Date().toISOString(),
    });
    // Re-throw so it's caught by the outer try-catch
    throw error;
  }
}

/**
 * Process user.created webhook event
 * This is the PRIMARY event since emailAddress.created may not be available in all Clerk instances
 */
async function handleUserCreated(event: ClerkUserWebhookEvent): Promise<void> {
  const { id: clerkUserId, first_name, last_name } = event.data;
  const email = getPrimaryEmail(event);

  // Log webhook receipt with full context
  console.log('[Webhook] Processing user.created event:', {
    clerkUserId,
    email: email || 'NO_EMAIL',
    firstName: first_name || null,
    lastName: last_name || null,
    emailAddressesCount: event.data.email_addresses?.length || 0,
    emailAddresses: event.data.email_addresses?.map(e => e.email_address) || [],
    timestamp: new Date().toISOString(),
  });

  // If no email, log warning but don't fail the webhook
  // The user was successfully created in Clerk, we just can't sync to Audienceful
  if (!email) {
    console.warn('[Webhook] User has no email address, skipping Audienceful sync:', {
      clerkUserId,
      emailAddresses: event.data.email_addresses?.length || 0,
      emailAddressesData: event.data.email_addresses,
    });
    return;
  }

  // Tag user in Audienceful
  try {
    const result = await tagAsAppUser(
      email,
      clerkUserId,
      first_name || undefined,
      last_name || undefined
    );

    console.log('[Webhook] Successfully tagged user in Audienceful:', {
      email,
      clerkUserId,
      audiencefulId: result.id || result.uid,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Webhook] Failed to tag user in Audienceful:', {
      email,
      clerkUserId,
      error: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString(),
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
  const { id: clerkUserId, first_name, last_name } = event.data;
  const email = getPrimaryEmail(event);

  // Log webhook receipt with full context
  console.log('[Webhook] Processing user.updated event:', {
    clerkUserId,
    email: email || 'NO_EMAIL',
    firstName: first_name || null,
    lastName: last_name || null,
    timestamp: new Date().toISOString(),
  });

  // If no email, log and skip - don't fail the webhook
  if (!email) {
    console.log('[Webhook] User has no email, skipping Audienceful update:', {
      clerkUserId,
      emailAddresses: event.data.email_addresses?.length || 0,
    });
    return;
  }

  // Update user in Audienceful (this will also tag them as app_user if not already tagged)
  try {
    const result = await tagAsAppUser(
      email,
      clerkUserId,
      first_name || undefined,
      last_name || undefined
    );

    console.log('[Webhook] Successfully updated user in Audienceful:', {
      email,
      clerkUserId,
      audiencefulId: result.id || result.uid,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Webhook] Failed to update user in Audienceful:', {
      email,
      clerkUserId,
      error: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString(),
    });

    // Don't throw - log error but don't fail the webhook
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
  const startTime = Date.now();
  
  // Wrap everything in try-catch to ensure we always return a response
  try {
    // Log immediately when webhook is received
    console.log('[Webhook] Webhook request received:', {
      method: request.method,
      url: request.url,
      headers: {
        'svix-id': request.headers.get('svix-id') || 'MISSING',
        'svix-timestamp': request.headers.get('svix-timestamp') || 'MISSING',
        'svix-signature': request.headers.get('svix-signature') ? 'PRESENT' : 'MISSING',
      },
      timestamp: new Date().toISOString(),
    });
    
    const webhookSecret = import.meta.env.CLERK_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Webhook] CLERK_WEBHOOK_SECRET not configured');
      return serverErrorResponse(
        new Error('Webhook secret not configured'),
        { endpoint: '/api/webhooks/clerk' }
      );
    }

    // Check if Audienceful API key is configured (log warning but don't fail webhook)
    const audiencefulKey = import.meta.env.AUDIENCEFUL_API_KEY;
    if (!audiencefulKey) {
      console.warn('[Webhook] AUDIENCEFUL_API_KEY not configured - Audienceful sync will fail');
    }

    // Get the raw body and headers needed for verification
    let payload: string;
    try {
      payload = await request.text();
      console.log('[Webhook] Payload received:', {
        payloadLength: payload.length,
        payloadPreview: payload.substring(0, 200),
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[Webhook] Failed to read request body:', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return serverErrorResponse(
        new Error('Failed to read webhook payload'),
        { endpoint: '/api/webhooks/clerk' }
      );
    }

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
    let event: ClerkWebhookEvent;

    try {
      const wh = new Webhook(webhookSecret);
      event = wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkWebhookEvent;
      
      console.log('[Webhook] Signature verification successful:', {
        eventType: event.type,
        eventObject: event.object,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[Webhook] Signature verification failed:', {
        error: error.message,
        errorStack: error.stack,
        payloadPreview: payload.substring(0, 500),
        headers: {
          svixId: svixId,
          svixTimestamp: svixTimestamp,
          svixSignature: svixSignature ? 'PRESENT' : 'MISSING',
        },
        timestamp: new Date().toISOString(),
      });
      return unauthorizedResponse('Invalid webhook signature');
    }

    // Process the event based on type
    let userId: string;
    try {
      if (event.type === 'emailAddress.created') {
        userId = (event as ClerkEmailWebhookEvent).data.user_id || '';
      } else {
        userId = (event as ClerkUserWebhookEvent).data.id || '';
      }
    } catch (error: any) {
      console.error('[Webhook] Error extracting userId:', {
        eventType: event.type,
        error: error.message,
        eventData: JSON.stringify(event.data).substring(0, 500),
      });
      throw error;
    }
    
    console.log('[Webhook] Received webhook event:', {
      type: event.type,
      userId,
      timestamp: event.timestamp,
      receivedAt: new Date().toISOString(),
    });

    // Wrap event processing in try-catch to ensure webhook always returns 200 OK
    // Even if Audienceful sync fails, we don't want Clerk to retry endlessly
    try {
      console.log('[Webhook] About to process event, type:', event.type);
      
      switch (event.type) {
        case 'emailAddress.created':
          // This event may not be available in all Clerk instances
          console.log('[Webhook] Handling emailAddress.created event');
          await handleEmailCreated(event as ClerkEmailWebhookEvent);
          break;

        case 'user.created':
          // PRIMARY event - this is what's available in Clerk dashboard
          console.log('[Webhook] Handling user.created event');
          await handleUserCreated(event as ClerkUserWebhookEvent);
          break;

        case 'user.updated':
          console.log('[Webhook] Handling user.updated event');
          await handleUserUpdated(event as ClerkUserWebhookEvent);
          break;

        case 'user.deleted':
          console.log('[Webhook] Handling user.deleted event');
          await handleUserDeleted(event as ClerkUserWebhookEvent);
          break;

        default:
          console.log('[Webhook] Unhandled webhook event type:', {
            eventType: event.type,
            eventData: JSON.stringify(event.data).substring(0, 500),
            fullEvent: JSON.stringify(event).substring(0, 1000),
          });
      }
    } catch (error: any) {
      // Log the error but don't fail the webhook
      // This catches any unexpected errors in event handlers
      console.error('[Webhook] Error processing event (webhook will still succeed):', {
        eventType: event.type,
        error: error.message,
        errorStack: error.stack,
        errorName: error.name,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 1000),
        timestamp: new Date().toISOString(),
      });

      let errorUserId: string;
      try {
        if (event.type === 'emailAddress.created') {
          errorUserId = (event as ClerkEmailWebhookEvent).data?.user_id || 'unknown';
        } else {
          errorUserId = (event as ClerkUserWebhookEvent).data?.id || 'unknown';
        }
      } catch (extractError: any) {
        console.error('[Webhook] Error extracting userId for error logging:', extractError.message);
        errorUserId = 'unknown';
      }
      
      handleAPIError(error, {
        endpoint: '/api/webhooks/clerk',
        action: `process_${event.type}`,
        userId: errorUserId,
      });
    }

    // Always return success to Clerk, even if Audienceful sync failed
    // This prevents Clerk from retrying the webhook endlessly
    const duration = Date.now() - startTime;
    const response = successResponse({
      message: 'Webhook processed successfully',
      eventType: event.type,
    });
    
    console.log('[Webhook] Webhook processing complete, returning response:', {
      eventType: event.type,
      durationMs: duration,
      statusCode: response.status,
      timestamp: new Date().toISOString(),
    });

    return response;
  } catch (error: any) {
    // This catch block handles errors in the main webhook processing
    const duration = Date.now() - startTime;
    console.error('[Webhook] Error in webhook processing:', {
      error: error.message,
      errorStack: error.stack,
      errorName: error.name,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    });

    // For signature/auth errors, return 401
    if (error.message?.includes('signature') || error.message?.includes('Unauthorized')) {
      return unauthorizedResponse(error.message || 'Invalid webhook signature');
    }

    // For other errors, return 500 but log extensively
    // If serverErrorResponse fails, return a simple response
    try {
      return serverErrorResponse(error, {
        endpoint: '/api/webhooks/clerk',
        action: 'process_webhook',
      });
    } catch (responseError: any) {
      // If even creating a response fails, return minimal response
      console.error('[Webhook] Failed to create error response:', responseError);
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error?.message || 'An unexpected error occurred',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }
};
