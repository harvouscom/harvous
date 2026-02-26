/**
 * Merge a TEST Clerk user's data into the LIVE Clerk user without overwriting
 * live's UserMetadata or UserLifetimeXP. Use when production was mistakenly
 * on pk_test and some data was created under test user IDs; production is
 * now on pk_live and you want the live account to own all data.
 *
 * Single user (from repo root, with production DB credentials in .env):
 *   TEST_CLERK_USER_ID=user_35FUJeL... LIVE_CLERK_USER_ID=user_35TxUL... \
 *   npx tsx scripts/merge-test-user-into-live.ts
 *
 * Batch (all affected users): provide a CSV of test_id,live_id pairs.
 *   MERGE_PAIRS_CSV=merge-pairs.csv npx tsx scripts/merge-test-user-into-live.ts
 * CSV format: one pair per line, "test_user_id,live_user_id". First line may be header "test_user_id,live_user_id".
 *
 * Requires: ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  db,
  Spaces,
  Threads,
  Notes,
  Comments,
  Members,
  SpaceInvitations,
  UserMetadata,
  UserXP,
  UserSeasonalXP,
  UserLifetimeXP,
  WeeklyStreaks,
  Tags,
  UserInboxItems,
} from '../server/db';
import { eq, and } from 'drizzle-orm';
import { nowISO } from '../server/db/dates';

function parsePairsCsv(csvPath: string): Array<{ testId: string; liveId: string }> {
  const abs = path.isAbsolute(csvPath) ? csvPath : path.resolve(process.cwd(), csvPath);
  const content = fs.readFileSync(abs, 'utf-8');
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  const pairs: Array<{ testId: string; liveId: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const [a, b] = line.split(',').map((s) => s.trim());
    if (!a || !b) continue;
    if (i === 0 && a === 'test_user_id' && b === 'live_user_id') continue;
    if (a.startsWith('user_') && b.startsWith('user_')) pairs.push({ testId: a, liveId: b });
  }
  return pairs;
}

async function mergeOne(TEST_ID: string, LIVE_ID: string): Promise<void> {
  if (TEST_ID === LIVE_ID) return;
  console.log('Merging data from TEST', TEST_ID, 'into LIVE', LIVE_ID);

  // 1. Content tables: reassign test -> live (no unique userId conflict)
  await db.update(Spaces).set({ userId: LIVE_ID }).where(eq(Spaces.userId, TEST_ID));
  await db.update(Threads).set({ userId: LIVE_ID }).where(eq(Threads.userId, TEST_ID));
  await db.update(Notes).set({ userId: LIVE_ID }).where(eq(Notes.userId, TEST_ID));
  await db.update(Comments).set({ userId: LIVE_ID }).where(eq(Comments.userId, TEST_ID));
  await db.update(Members).set({ userId: LIVE_ID }).where(eq(Members.userId, TEST_ID));
  await db.update(SpaceInvitations).set({ invitedBy: LIVE_ID }).where(eq(SpaceInvitations.invitedBy, TEST_ID));
  await db.update(SpaceInvitations).set({ invitedUserId: LIVE_ID }).where(eq(SpaceInvitations.invitedUserId, TEST_ID));
  await db.update(UserXP).set({ userId: LIVE_ID }).where(eq(UserXP.userId, TEST_ID));
  await db.update(WeeklyStreaks).set({ userId: LIVE_ID }).where(eq(WeeklyStreaks.userId, TEST_ID));
  await db.update(Tags).set({ userId: LIVE_ID }).where(eq(Tags.userId, TEST_ID));
  await db.update(UserInboxItems).set({ userId: LIVE_ID }).where(eq(UserInboxItems.userId, TEST_ID));
  console.log('  Reassigned content: Spaces, Threads, Notes, Comments, Members, SpaceInvitations, UserXP, WeeklyStreaks, Tags, UserInboxItems');

  // 2. UserMetadata: merge into live, then remove test row (do not delete live's row)
  const liveMeta = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, LIVE_ID)).get();
  const testMeta = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, TEST_ID)).get();
  if (testMeta) {
    if (liveMeta) {
      const maxSimpleNoteId = Math.max(
        liveMeta.highestSimpleNoteId ?? 0,
        testMeta.highestSimpleNoteId ?? 0
      );
      await db.update(UserMetadata).set({
        highestSimpleNoteId: maxSimpleNoteId,
        updatedAt: nowISO(),
      }).where(eq(UserMetadata.userId, LIVE_ID));
      console.log('  Merged UserMetadata: highestSimpleNoteId = max(live, test) =', maxSimpleNoteId);
    } else {
      // Live has no row; reassign test's row to live
      await db.update(UserMetadata).set({ userId: LIVE_ID, updatedAt: nowISO() }).where(eq(UserMetadata.userId, TEST_ID));
      console.log('  Reassigned test UserMetadata row to live (live had none)');
    }
    await db.delete(UserMetadata).where(eq(UserMetadata.userId, TEST_ID));
  }

  // 3. UserLifetimeXP: merge into live, then remove test row
  const liveLifetime = await db.select().from(UserLifetimeXP).where(eq(UserLifetimeXP.userId, LIVE_ID)).get();
  const testLifetime = await db.select().from(UserLifetimeXP).where(eq(UserLifetimeXP.userId, TEST_ID)).get();
  if (testLifetime) {
    if (liveLifetime) {
      const combinedTotal = (liveLifetime.totalXP ?? 0) + (testLifetime.totalXP ?? 0);
      const latestUpdated = [liveLifetime.lastUpdated, testLifetime.lastUpdated].filter(Boolean).sort().pop()!;
      await db.update(UserLifetimeXP).set({
        totalXP: combinedTotal,
        lastUpdated: latestUpdated,
      }).where(eq(UserLifetimeXP.userId, LIVE_ID));
      console.log('  Merged UserLifetimeXP: totalXP = live + test =', combinedTotal);
    } else {
      await db.update(UserLifetimeXP).set({ userId: LIVE_ID }).where(eq(UserLifetimeXP.userId, TEST_ID));
      console.log('  Reassigned test UserLifetimeXP row to live (live had none)');
    }
    await db.delete(UserLifetimeXP).where(eq(UserLifetimeXP.userId, TEST_ID));
  }

  // 4. UserSeasonalXP: per-season merge (reassign or sum into live)
  const testSeasonal = await db.select().from(UserSeasonalXP).where(eq(UserSeasonalXP.userId, TEST_ID)).all();
  for (const row of testSeasonal) {
    const liveRow = await db.select().from(UserSeasonalXP).where(and(eq(UserSeasonalXP.userId, LIVE_ID), eq(UserSeasonalXP.season, row.season))).get();
    if (liveRow) {
      await db.update(UserSeasonalXP).set({
        totalXP: (liveRow.totalXP ?? 0) + (row.totalXP ?? 0),
        sessionCount: (liveRow.sessionCount ?? 0) + (row.sessionCount ?? 0),
        updatedAt: nowISO(),
      }).where(eq(UserSeasonalXP.id, liveRow.id));
      await db.delete(UserSeasonalXP).where(eq(UserSeasonalXP.id, row.id));
    } else {
      await db.update(UserSeasonalXP).set({ userId: LIVE_ID, updatedAt: nowISO() }).where(eq(UserSeasonalXP.id, row.id));
    }
  }
  if (testSeasonal.length) console.log('  Merged UserSeasonalXP:', testSeasonal.length, 'season(s)');

  console.log('Done. Live account', LIVE_ID, 'now owns all data.');
}

async function run() {
  const csvPath = process.env.MERGE_PAIRS_CSV;
  let pairs: Array<{ testId: string; liveId: string }>;

  if (csvPath) {
    pairs = parsePairsCsv(csvPath);
    if (pairs.length === 0) {
      console.error('No valid test_id,live_id pairs in', csvPath);
      process.exit(1);
    }
    console.log('Batch mode: merging', pairs.length, 'user pair(s) from', csvPath);
    for (let i = 0; i < pairs.length; i++) {
      const { testId, liveId } = pairs[i];
      console.log('\n---', i + 1, '/', pairs.length, '---');
      await mergeOne(testId, liveId);
    }
    console.log('\nBatch done. Have users sign in with live keys to verify.');
    return;
  }

  const TEST_ID = process.env.TEST_CLERK_USER_ID;
  const LIVE_ID = process.env.LIVE_CLERK_USER_ID;
  if (!TEST_ID || !LIVE_ID) {
    console.error('Set TEST_CLERK_USER_ID and LIVE_CLERK_USER_ID, or MERGE_PAIRS_CSV for batch.');
    process.exit(1);
  }
  if (TEST_ID === LIVE_ID) {
    console.error('TEST and LIVE must be different.');
    process.exit(1);
  }
  await mergeOne(TEST_ID, LIVE_ID);
  console.log('Sign in with live keys to verify.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
