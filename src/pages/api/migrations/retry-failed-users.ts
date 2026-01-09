import type { APIRoute } from 'astro';
import { createClerkClient } from '@clerk/backend';
import { tagAsAppUser } from '@/utils/audienceful';

/**
 * Retry migration for specific users that failed in previous runs
 *
 * This endpoint allows you to retry only the users that failed (e.g., due to 404 errors)
 * without re-processing all users.
 *
 * Run via: POST /api/migrations/retry-failed-users
 *
 * Body: {
 *   "userIds": ["user_123", "user_456", ...]  // Array of Clerk user IDs
 *   OR
 *   "emails": ["user@example.com", ...]        // Array of email addresses
 * }
 *
 * Security: Requires a special migration key to prevent unauthorized execution
 */

interface RetryResults {
  totalUsers: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{
    userId: string;
    email: string;
    error: string;
  }>;
  startTime: number;
  endTime?: number;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Check for migration authorization key
    const authHeader = request.headers.get('Authorization');
    const migrationKey = import.meta.env.MIGRATION_KEY || process.env.MIGRATION_KEY;

    // Allow if:
    // 1. Migration key is set and matches, OR
    // 2. No migration key is set (for development/initial setup)
    const isAuthorized = !migrationKey || authHeader === `Bearer ${migrationKey}`;

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message:
            'Valid migration key required. Set MIGRATION_KEY environment variable and pass as Bearer token.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    let body: any;
    try {
      body = await request.json();
    } catch (error: any) {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid JSON in request body. Expected format: { "userIds": ["user_123", ...] } or { "emails": ["user@example.com", ...] }',
          details: error.message || 'Failed to parse JSON',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const userIds = body.userIds || [];
    const emails = body.emails || [];

    if (userIds.length === 0 && emails.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Must provide either userIds or emails array in request body. Example: { "userIds": ["user_123", "user_456"] }',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Track retry progress
    const results: RetryResults = {
      totalUsers: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      startTime: Date.now(),
    };

    console.log('[Retry Migration] Starting retry for specific users...', {
      userIdCount: userIds.length,
      emailCount: emails.length,
    });

    // Initialize Clerk client
    const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error('CLERK_SECRET_KEY not configured');
    }

    const clerkClient = createClerkClient({
      secretKey: clerkSecretKey,
    });

    // Check if Audienceful is configured
    const audiencefulKey = import.meta.env.AUDIENCEFUL_API_KEY;
    if (!audiencefulKey) {
      throw new Error('AUDIENCEFUL_API_KEY not configured');
    }

    // Process users by ID
    for (const userId of userIds) {
      results.totalUsers++;

      try {
        const user = await clerkClient.users.getUser(userId);

        // Get primary email
        const primaryEmail = user.emailAddresses.find(
          (email) => email.id === user.primaryEmailAddressId
        );

        if (!primaryEmail) {
          console.log(`[Retry Migration] Skipping user ${userId} - no email address`);
          results.skipped++;
          continue;
        }

        const email = primaryEmail.emailAddress;
        const firstName = user.firstName || undefined;
        const lastName = user.lastName || undefined;

        console.log(`[Retry Migration] Processing user: ${email} (${userId})`);

        // Tag user in Audienceful
        try {
          await tagAsAppUser(email, userId, firstName, lastName);
          results.successful++;
          console.log(`[Retry Migration] ✓ Successfully tagged: ${email}`);
        } catch (error: any) {
          results.failed++;
          const errorMessage = error.message || 'Unknown error';
          results.errors.push({
            userId,
            email,
            error: errorMessage,
          });
          console.error(`[Retry Migration] ✗ Failed to tag ${email}:`, errorMessage);
        }
      } catch (error: any) {
        results.failed++;
        const errorMessage = error.message || 'Unknown error';
        results.errors.push({
          userId,
          email: 'unknown',
          error: `Failed to fetch user from Clerk: ${errorMessage}`,
        });
        console.error(`[Retry Migration] ✗ Failed to fetch user ${userId}:`, errorMessage);
      }
    }

    // Process users by email (need to find their user IDs first)
    for (const email of emails) {
      results.totalUsers++;

      try {
        // Search for user by email in Clerk
        const { data: users } = await clerkClient.users.getUserList({
          emailAddress: [email],
          limit: 1,
        });

        if (users.length === 0) {
          results.skipped++;
          results.errors.push({
            userId: 'unknown',
            email,
            error: 'User not found in Clerk',
          });
          console.log(`[Retry Migration] Skipping ${email} - not found in Clerk`);
          continue;
        }

        const user = users[0];
        const firstName = user.firstName || undefined;
        const lastName = user.lastName || undefined;

        console.log(`[Retry Migration] Processing user: ${email} (${user.id})`);

        // Tag user in Audienceful
        try {
          await tagAsAppUser(email, user.id, firstName, lastName);
          results.successful++;
          console.log(`[Retry Migration] ✓ Successfully tagged: ${email}`);
        } catch (error: any) {
          results.failed++;
          const errorMessage = error.message || 'Unknown error';
          results.errors.push({
            userId: user.id,
            email,
            error: errorMessage,
          });
          console.error(`[Retry Migration] ✗ Failed to tag ${email}:`, errorMessage);
        }
      } catch (error: any) {
        results.failed++;
        const errorMessage = error.message || 'Unknown error';
        results.errors.push({
          userId: 'unknown',
          email,
          error: `Failed to process: ${errorMessage}`,
        });
        console.error(`[Retry Migration] ✗ Failed to process ${email}:`, errorMessage);
      }
    }

    results.endTime = Date.now();
    const durationSeconds = ((results.endTime - results.startTime) / 1000).toFixed(2);

    console.log('[Retry Migration] Retry complete:', {
      totalUsers: results.totalUsers,
      successful: results.successful,
      failed: results.failed,
      skipped: results.skipped,
      durationSeconds,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Retry complete',
        results: {
          totalUsers: results.totalUsers,
          successful: results.successful,
          failed: results.failed,
          skipped: results.skipped,
          errorCount: results.errors.length,
          errors: results.errors,
          durationSeconds: parseFloat(durationSeconds),
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[Retry Migration] Fatal error:', error);
    return new Response(
      JSON.stringify({
        error: 'Retry failed',
        message: error.message || 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
