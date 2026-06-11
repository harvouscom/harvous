/**
 * One-time backfill: populate `UserMetadata.tier` from the current Clerk billing
 * entitlement, so the DB becomes the tier source of truth before `BILLING_TIER_DB_ONLY`
 * is flipped to `true`. Idempotent and additive — only promotes users to `unlimited`;
 * never downgrades (a user the script can't resolve stays at the column default `free`).
 *
 * While `BILLING_TIER_DB_ONLY` is unset/false, `getTierForUserId` reads the DB first and
 * falls back to the Clerk Billing API when the DB still says `free` — so this script reuses
 * it to resolve the real tier without duplicating Clerk logic.
 *
 * Usage (requires the same Supabase env as the API; and CLERK_SECRET_KEY):
 *   npx tsx server/scripts/backfill-tier-from-clerk.ts --dry-run
 *   npx tsx server/scripts/backfill-tier-from-clerk.ts
 *   npx tsx server/scripts/backfill-tier-from-clerk.ts --userId=user_xxx
 *
 * After running and spot-checking, set BILLING_TIER_DB_ONLY=true to drop the Clerk fallback.
 */

import 'dotenv/config';
import { db, UserMetadata } from '../db';
import { getTierForUserId, setTierForUserId } from '../utils/tier-limits';

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let userId: string | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
  }
  return { dryRun, userId };
}

async function main() {
  const { dryRun, userId } = parseArgs();
  if (process.env.BILLING_TIER_DB_ONLY === 'true') {
    console.warn('⚠️  BILLING_TIER_DB_ONLY=true — the Clerk fallback is disabled, so this backfill cannot resolve tiers. Unset it, run the backfill, then re-enable.');
    process.exit(1);
  }

  const rows = userId
    ? [{ userId }]
    : await db.select({ userId: UserMetadata.userId }).from(UserMetadata);

  console.log(`${dryRun ? '[dry-run] ' : ''}Resolving tier for ${rows.length} user(s)…`);

  let promoted = 0;
  let free = 0;
  for (const { userId: uid } of rows) {
    const tier = await getTierForUserId(uid); // DB-first, Clerk fallback while flag is off
    if (tier === 'unlimited') {
      promoted++;
      console.log(`  unlimited → ${uid}`);
      if (!dryRun) await setTierForUserId(uid, 'unlimited');
    } else {
      free++;
    }
  }

  console.log(`\n${dryRun ? '[dry-run] ' : ''}Done. ${promoted} unlimited, ${free} free.`);
  if (dryRun && promoted > 0) console.log('Re-run without --dry-run to write UserMetadata.tier.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('backfill-tier-from-clerk failed:', err);
  process.exit(1);
});
