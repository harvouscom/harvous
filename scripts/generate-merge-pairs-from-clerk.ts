/**
 * Generate merge-pairs.csv by listing users from Clerk Test and Live applications
 * and matching them by email. Uses @clerk/backend SDK (same as server) so response
 * shape matches Clerk docs: User has emailAddresses[], primaryEmailAddressId, each
 * item has emailAddress.
 *
 * Usage (from repo root):
 *   CLERK_SECRET_KEY_TEST=sk_test_... CLERK_SECRET_KEY=sk_live_... \
 *   npx tsx scripts/generate-merge-pairs-from-clerk.ts
 *
 * Output: merge-pairs.csv (or OUTPUT_CSV path). Pairs where same email exists in BOTH apps.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClerkClient } from '@clerk/backend';

const LIVE_SECRET = process.env.CLERK_SECRET_KEY;
const TEST_SECRET = process.env.CLERK_SECRET_KEY_TEST;
const OUTPUT_CSV = process.env.OUTPUT_CSV || path.join(process.cwd(), 'merge-pairs.csv');

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** Get all emails for a user (Clerk SDK User: emailAddresses[].emailAddress, primaryEmailAddressId). */
function getAllEmails(user: { emailAddresses?: Array<{ id: string; emailAddress: string }>; primaryEmailAddressId?: string | null }): string[] {
  const list = user.emailAddresses ?? [];
  const emails: string[] = [];
  const seen = new Set<string>();
  function add(e: string | undefined) {
    if (!e || typeof e !== 'string') return;
    const n = normalizeEmail(e);
    if (n && n.includes('@') && !seen.has(n)) {
      seen.add(n);
      emails.push(n);
    }
  }
  if (user.primaryEmailAddressId) {
    const primary = list.find((e) => e.id === user.primaryEmailAddressId);
    if (primary) add(primary.emailAddress);
  }
  for (const item of list) add(item.emailAddress);
  return emails;
}

async function fetchAllUsers(secretKey: string): Promise<{ users: Array<{ id: string; emailAddresses?: Array<{ id: string; emailAddress: string }>; primaryEmailAddressId?: string | null }>; totalCount: number }> {
  const client = createClerkClient({ secretKey });
  const users: Array<{ id: string; emailAddresses?: Array<{ id: string; emailAddress: string }>; primaryEmailAddressId?: string | null }> = [];
  let offset = 0;
  const limit = 500;
  let totalCount = 0;
  while (true) {
    const { data, totalCount: total } = await client.users.getUserList({ limit, offset });
    if (total !== undefined) totalCount = total;
    if (data.length === 0) break;
    users.push(...data);
    offset += data.length;
    if (data.length < limit || (totalCount > 0 && users.length >= totalCount)) break;
  }
  return { users, totalCount: totalCount || users.length };
}

async function main() {
  if (!LIVE_SECRET || !TEST_SECRET) {
    console.error('Set both CLERK_SECRET_KEY (live) and CLERK_SECRET_KEY_TEST (test).');
    console.error('Get the test key from Clerk Dashboard → your Test application → API Keys.');
    process.exit(1);
  }

  console.log('Fetching users from Clerk Live application...');
  const { users: liveUsers, totalCount: liveTotal } = await fetchAllUsers(LIVE_SECRET);
  console.log('  Live:', liveUsers.length, 'fetched (total in app:', liveTotal, ')');

  console.log('Fetching users from Clerk Test application...');
  const { users: testUsers, totalCount: testTotal } = await fetchAllUsers(TEST_SECRET);
  console.log('  Test:', testUsers.length, 'fetched (total in app:', testTotal, ')');

  if (process.env.DEBUG_CLERK === '1') {
    const liveSample = liveUsers[0];
    const testSample = testUsers[0];
    console.log('DEBUG first Live user keys:', liveSample ? Object.keys(liveSample) : []);
    console.log('DEBUG first Live emailAddresses?.length:', liveSample?.emailAddresses?.length ?? 'none');
    if (liveSample?.emailAddresses?.[0]) console.log('DEBUG first Live email item keys:', Object.keys(liveSample.emailAddresses[0]));
    console.log('DEBUG first Test user keys:', testSample ? Object.keys(testSample) : []);
    console.log('DEBUG getAllEmails(live[0]):', liveSample ? getAllEmails(liveSample) : []);
    console.log('DEBUG getAllEmails(test[0]):', testSample ? getAllEmails(testSample) : []);
  }

  const liveByEmail = new Map<string, string>();
  let liveNoEmail = 0;
  for (const u of liveUsers) {
    const emails = getAllEmails(u);
    if (emails.length === 0) liveNoEmail++;
    else for (const e of emails) liveByEmail.set(e, u.id);
  }

  const pairs: Array<{ testId: string; liveId: string; email: string }> = [];
  let testNoEmail = 0;
  let testNoMatch = 0;
  for (const u of testUsers) {
    const emails = getAllEmails(u);
    if (emails.length === 0) {
      testNoEmail++;
      continue;
    }
    let liveId: string | undefined;
    let matchedEmail: string | undefined;
    for (const e of emails) {
      liveId = liveByEmail.get(e);
      if (liveId) {
        matchedEmail = e;
        break;
      }
    }
    if (!liveId || !matchedEmail) {
      testNoMatch++;
      continue;
    }
    if (liveId !== u.id) pairs.push({ testId: u.id, liveId, email: matchedEmail });
  }

  console.log('Matched by email:', pairs.length, 'pairs');
  if (testNoEmail > 0) console.log('  (Test users with no email extracted:', testNoEmail + ')');
  if (testNoMatch > 0) console.log('  (Test users with email but no matching Live user:', testNoMatch + ')');
  if (liveNoEmail > 0) console.log('  (Live users with no email extracted:', liveNoEmail + ')');

  const lines = ['test_user_id,live_user_id', ...pairs.map((p) => `${p.testId},${p.liveId}`)];
  fs.writeFileSync(OUTPUT_CSV, lines.join('\n') + '\n', 'utf-8');
  console.log('Wrote', OUTPUT_CSV);
  console.log('Run: MERGE_PAIRS_CSV=' + path.basename(OUTPUT_CSV) + ' npx tsx scripts/merge-test-user-into-live.ts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
