/**
 * Nightly Clerk → Audienceful activity + product-behavior refresh.
 * Paginate Clerk users and upsert Audienceful fields (rate-limited).
 */
import { createClerkClient } from '@clerk/backend';
import { hasTruthyProductFlags, tagAsAppUser, type AudiencefulProductFlags } from '@/utils/audienceful';
import { loadAudiencefulProductFlagsFromDb } from './utils/audienceful-product-flags-from-db';

export const AUDIENCEFUL_ACTIVITY_BATCH_SIZE = 100;
export const AUDIENCEFUL_ACTIVITY_MAX_USERS = 5000;
export const AUDIENCEFUL_ACTIVITY_TIME_BUDGET_MS = 25_000;
/** Pause between Audienceful upserts to stay under their rate limit. */
export const AUDIENCEFUL_ACTIVITY_DELAY_MS = 1100;

export type AudiencefulActivitySyncSummary = {
  totalUsers: number;
  successful: number;
  failed: number;
  skipped: number;
  remaining: boolean;
  durationMs: number;
};

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAudiencefulActivitySync(options?: {
  clock?: () => number;
  batchSize?: number;
  maxUsers?: number;
  timeBudgetMs?: number;
  delayMs?: number;
}): Promise<AudiencefulActivitySyncSummary> {
  const clock = options?.clock ?? Date.now;
  const batchSize = options?.batchSize ?? AUDIENCEFUL_ACTIVITY_BATCH_SIZE;
  const maxUsers = options?.maxUsers ?? AUDIENCEFUL_ACTIVITY_MAX_USERS;
  const timeBudgetMs = options?.timeBudgetMs ?? AUDIENCEFUL_ACTIVITY_TIME_BUDGET_MS;
  const delayMs = options?.delayMs ?? AUDIENCEFUL_ACTIVITY_DELAY_MS;

  const startedAt = clock();
  const summary: AudiencefulActivitySyncSummary = {
    totalUsers: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    remaining: false,
    durationMs: 0,
  };

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY not configured');
  if (!process.env.AUDIENCEFUL_API_KEY) throw new Error('AUDIENCEFUL_API_KEY not configured');

  const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
  let offset = 0;
  let lastBatchSize = 0;

  while (summary.totalUsers < maxUsers && clock() - startedAt < timeBudgetMs) {
    const limit = Math.min(batchSize, maxUsers - summary.totalUsers);
    const { data: users } = await clerkClient.users.getUserList({
      limit,
      offset,
      orderBy: '-created_at',
    });
    lastBatchSize = users.length;
    if (users.length === 0) break;

    for (const user of users) {
      if (clock() - startedAt >= timeBudgetMs) {
        summary.remaining = true;
        break;
      }
      summary.totalUsers++;
      const primary =
        user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ||
        user.emailAddresses[0];
      if (!primary?.emailAddress) {
        summary.skipped++;
        continue;
      }

      try {
        let productFlags: AudiencefulProductFlags = {};
        try {
          productFlags = await loadAudiencefulProductFlagsFromDb(user.id);
        } catch (dbError: unknown) {
          const message = dbError instanceof Error ? dbError.message : String(dbError);
          console.warn('[audienceful-activity-sync] product flags db failed', {
            userId: user.id,
            message,
          });
        }

        await tagAsAppUser(
          primary.emailAddress,
          user.id,
          user.firstName || undefined,
          user.lastName || undefined,
          {
            signedUpAt: user.createdAt ?? null,
            lastSignInAt: user.lastSignInAt ?? null,
            lastActiveAt: user.lastActiveAt ?? user.updatedAt ?? null,
          },
          hasTruthyProductFlags(productFlags) ? productFlags : undefined,
        );
        summary.successful++;
      } catch (error: unknown) {
        summary.failed++;
        const message = error instanceof Error ? error.message : String(error);
        console.error('[audienceful-activity-sync] failed', { userId: user.id, message });
      }

      await sleep(delayMs);
    }

    if (summary.remaining) break;
    offset += users.length;
    if (lastBatchSize < limit) break;
  }

  if (lastBatchSize === batchSize && summary.totalUsers >= maxUsers) {
    summary.remaining = true;
  }

  summary.durationMs = clock() - startedAt;
  return summary;
}

export function createAudiencefulActivitySyncHandler(
  sync: typeof runAudiencefulActivitySync = runAudiencefulActivitySync,
) {
  return async function handler() {
    try {
      const results = await sync();
      console.log(
        `[audienceful-activity-sync] total=${results.totalUsers} ok=${results.successful} failed=${results.failed} skipped=${results.skipped} remaining=${results.remaining} ms=${results.durationMs}`,
      );
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true, results }),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[audienceful-activity-sync] fatal', message);
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: false, error: message }),
      };
    }
  };
}

export const handler = createAudiencefulActivitySyncHandler();
export default handler;
