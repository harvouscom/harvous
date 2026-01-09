import type { APIRoute } from 'astro';
import { createClerkClient } from '@clerk/backend';
import { tagAsAppUser } from '@/utils/audienceful';

/**
 * One-time migration to sync all existing Clerk users to Audienceful
 *
 * This backfills Audienceful with all users who signed up before the webhook was set up.
 * Each user will be tagged with "app_user" and their clerk_user_id will be stored.
 *
 * IMPORTANT: This migration processes ALL users in Clerk
 *
 * Run once via: POST /api/migrations/sync-clerk-to-audienceful
 *
 * Security: Requires a special migration key to prevent unauthorized execution
 *
 * Optional query parameters:
 * - limit: Number of users to process (default: all)
 * - offset: Skip first N users (for resuming if interrupted)
 * - dryRun: Set to "true" to preview without making changes
 */

interface MigrationResults {
  totalUsers: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{
    userId: string;
    email: string;
    error: string;
  }>;
  dryRun: boolean;
  startTime: number;
  endTime?: number;
}

export const POST: APIRoute = async ({ request, url }) => {
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

    // Parse query parameters
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const dryRunParam = url.searchParams.get('dryRun');

    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const dryRun = dryRunParam === 'true';

    // Track migration progress
    const results: MigrationResults = {
      totalUsers: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      dryRun,
      startTime: Date.now(),
    };

    console.log('[Migration] Starting Clerk to Audienceful sync...', {
      dryRun,
      limit,
      offset,
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
    if (!audiencefulKey && !dryRun) {
      throw new Error('AUDIENCEFUL_API_KEY not configured');
    }

    // Fetch all users from Clerk with pagination
    let hasMore = true;
    let currentOffset = offset;
    const batchSize = 100; // Clerk API default limit

    while (hasMore) {
      console.log(`[Migration] Fetching users (offset: ${currentOffset})...`);

      const { data: users, totalCount } = await clerkClient.users.getUserList({
        limit: limit ? Math.min(batchSize, limit - results.totalUsers) : batchSize,
        offset: currentOffset,
      });

      console.log(`[Migration] Fetched ${users.length} users (total in Clerk: ${totalCount})`);

      // Process each user
      for (const user of users) {
        results.totalUsers++;

        // Get primary email
        const primaryEmail = user.emailAddresses.find(
          (email) => email.id === user.primaryEmailAddressId
        );

        if (!primaryEmail) {
          console.log(`[Migration] Skipping user ${user.id} - no email address`);
          results.skipped++;
          continue;
        }

        const email = primaryEmail.emailAddress;
        const firstName = user.firstName || undefined;
        const lastName = user.lastName || undefined;

        console.log(`[Migration] Processing user: ${email} (${user.id})`);

        if (dryRun) {
          console.log('[Migration] DRY RUN - Would tag:', {
            email,
            clerkUserId: user.id,
            firstName,
            lastName,
          });
          results.successful++;
          continue;
        }

        // Tag user in Audienceful
        try {
          await tagAsAppUser(email, user.id, firstName, lastName);
          results.successful++;
          console.log(`[Migration] ✓ Successfully tagged: ${email}`);
        } catch (error: any) {
          results.failed++;
          const errorMessage = error.message || 'Unknown error';
          results.errors.push({
            userId: user.id,
            email,
            error: errorMessage,
          });
          console.error(`[Migration] ✗ Failed to tag ${email}:`, errorMessage);
          
          // If we're getting close to timeout, log a warning
          const elapsed = Date.now() - results.startTime;
          if (elapsed > 20000) {
            console.warn(`[Migration] ⚠️ Approaching timeout - ${elapsed}ms elapsed`);
          }
        }
      }

      // Check if we should continue
      hasMore = users.length === batchSize && (!limit || results.totalUsers < limit);
      currentOffset += users.length;

      // Add a small delay between batches to avoid rate limiting
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    results.endTime = Date.now();
    const durationSeconds = ((results.endTime - results.startTime) / 1000).toFixed(2);

    console.log('[Migration] Clerk to Audienceful sync complete:', {
      totalUsers: results.totalUsers,
      successful: results.successful,
      failed: results.failed,
      skipped: results.skipped,
      durationSeconds,
      dryRun: results.dryRun,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: dryRun
          ? 'Dry run complete - no changes made'
          : 'Migration complete',
        results: {
          totalUsers: results.totalUsers,
          successful: results.successful,
          failed: results.failed,
          skipped: results.skipped,
          errorCount: results.errors.length,
          errors: results.errors,
          durationSeconds: parseFloat(durationSeconds),
          dryRun: results.dryRun,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[Migration] Fatal error:', error);
    
    // Check if it's a timeout error
    const isTimeout = error.name === 'TimeoutError' || 
                     error.message?.includes('timeout') ||
                     error.message?.includes('TIMEOUT');
    
    return new Response(
      JSON.stringify({
        error: 'Migration failed',
        message: error.message || 'Unknown error occurred',
        isTimeout,
        hint: isTimeout ? 'Function may have timed out. Try smaller batches (limit=10) or check Netlify function logs.' : undefined,
      }),
      {
        status: isTimeout ? 504 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
