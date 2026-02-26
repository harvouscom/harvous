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
 * Optional: SKIP_TEST_USER_IDS=user_1,user_2,... to skip merging those Test (Development) user IDs.
 *
 * Requires: ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { mergeDevUserIntoLive } from '../server/utils/merge-user-into-live';

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
  await mergeDevUserIntoLive(TEST_ID, LIVE_ID, (msg) => console.log(' ', msg));
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
