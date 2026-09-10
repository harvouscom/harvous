/**
 * One-time backfill: copy web thread titles into `Notes.primaryCollection` and
 * `Notes.secondaryCollections` for prototype / DB parity with native collection labels.
 *
 * Rules: see `server/utils/prototype-user-migration.ts`.
 *
 * Usage (requires `SUPABASE_DATABASE_URL` or `SUPABASE_DIRECT_URL` in env — same as API):
 *   npx tsx server/scripts/backfill-collections-from-threads.ts --dry-run
 *   npx tsx server/scripts/backfill-collections-from-threads.ts
 *   npx tsx server/scripts/backfill-collections-from-threads.ts --userId=user_xxx
 *   npx tsx server/scripts/backfill-collections-from-threads.ts --batch-size=300 --limit=1000
 *   npx tsx server/scripts/backfill-collections-from-threads.ts --repair-pins --dry-run
 *   npx tsx server/scripts/backfill-collections-from-threads.ts --repair-pins
 *
 * Staging vs production: point `.env` at the target Supabase DB before running; there is no separate flag.
 */

import 'dotenv/config';
import { db, Notes, eq, and, asc, gt, isNull, ne, sql, type SQL } from '../db';
import { requireDbTarget } from '../utils/require-db-target';
import {
  backfillCollectionsFromThreadsForUser,
  countCollectionBackfillCandidates,
  repairMigratedCollectionPins,
} from '../utils/prototype-user-migration';

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const repairPins = process.argv.includes('--repair-pins');
  let userId: string | undefined;
  let batchSize = 400;
  let maxNotes: number | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
    if (a.startsWith('--batch-size=')) {
      const n = parseInt(a.slice('--batch-size='.length), 10);
      if (!Number.isNaN(n) && n > 0) batchSize = n;
    }
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (!Number.isNaN(n) && n > 0) maxNotes = n;
    }
  }
  return { dryRun, repairPins, userId, batchSize, maxNotes };
}

const NOT_ONBOARDING_THREAD = sql`NOT starts_with(${Notes.threadId}::text, 'thread_onboarding_')`;

async function sampleCandidates(userId: string | undefined, take: number): Promise<string[]> {
  const conditions: SQL[] = [
    isNull(Notes.primaryCollection),
    eq(Notes.collectionUserOverride, false),
    eq(Notes.collectionPinned, false),
    ne(Notes.threadId, 'thread_unorganized'),
    NOT_ONBOARDING_THREAD,
  ];
  if (userId) conditions.push(eq(Notes.userId, userId));

  const rows = await db
    .select({ id: Notes.id, threadId: Notes.threadId })
    .from(Notes)
    .where(and(...conditions))
    .orderBy(asc(Notes.id))
    .limit(take);
  return rows.map((r) => `  ${r.id}  threadId=${r.threadId}`);
}

async function backfillAllUsers(batchSize: number, maxNotes?: number): Promise<number> {
  let totalUpdated = 0;
  let lastUserId: string | null = null;

  while (true) {
    const userConditions: SQL[] = [
      isNull(Notes.primaryCollection),
      eq(Notes.collectionUserOverride, false),
      eq(Notes.collectionPinned, false),
    ];
    if (lastUserId) userConditions.push(gt(Notes.userId, lastUserId));

    const userRows = await db
      .select({ userId: Notes.userId })
      .from(Notes)
      .where(and(...userConditions))
      .groupBy(Notes.userId)
      .orderBy(asc(Notes.userId))
      .limit(50);

    if (userRows.length === 0) break;

    for (const { userId } of userRows) {
      const remaining = maxNotes != null ? Math.max(0, maxNotes - totalUpdated) : undefined;
      if (remaining === 0) return totalUpdated;
      const updated = await backfillCollectionsFromThreadsForUser(userId, {
        batchSize,
        maxNotes: remaining,
      });
      totalUpdated += updated;
      lastUserId = userId;
      if (maxNotes != null && totalUpdated >= maxNotes) return totalUpdated;
    }

    if (userRows.length < 50) break;
  }

  return totalUpdated;
}

async function main() {
  requireDbTarget({ scriptName: 'backfill-collections', writes: true });
  const { dryRun, repairPins, userId, batchSize, maxNotes } = parseArgs();

  if (repairPins) {
    console.log(
      `${dryRun ? '[DRY RUN] ' : ''}Repair migrated collection pins${userId ? ` (userId=${userId})` : ' (all users)'}`,
    );
    const { candidates, updated } = await repairMigratedCollectionPins(userId, { dryRun, batchSize });
    console.log(`Candidate notes (primary matches thread title, unpinned): ${candidates}`);
    if (dryRun) {
      console.log('\n[DRY RUN] No rows updated.');
    } else {
      console.log(`Pinned notes: ${updated}`);
    }
    console.log('\nDone.');
    process.exit(0);
  }

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Backfill collections from threads (batchSize=${batchSize}${userId ? `, userId=${userId}` : ', all users'}${maxNotes != null ? `, limit=${maxNotes}` : ''})`,
  );

  const candidateCount = await countCollectionBackfillCandidates(userId);
  console.log(`Candidate notes (no primaryCollection, thread or junction membership): ${candidateCount}`);

  if (dryRun) {
    const samples = await sampleCandidates(userId, 20);
    if (samples.length > 0) {
      console.log(`\nSample candidate note ids (up to 20, threadId column path):\n${samples.join('\n')}`);
    }
    console.log('\n[DRY RUN] No rows updated. Review candidate count before running without --dry-run.');
    process.exit(0);
  }

  const updated = userId
    ? await backfillCollectionsFromThreadsForUser(userId, { batchSize, maxNotes })
    : await backfillAllUsers(batchSize, maxNotes);

  console.log(`\nUpdated notes: ${updated}`);
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('backfill-collections-from-threads failed:', err);
  process.exit(1);
});
