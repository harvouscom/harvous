/**
 * Generate merge-pairs.csv by listing users from Clerk Test and Live applications
 * and matching them by primary email. Run once to build the CSV, then run
 * MERGE_PAIRS_CSV=merge-pairs.csv npx tsx scripts/merge-test-user-into-live.ts
 *
 * Usage (from repo root):
 *   CLERK_SECRET_KEY_TEST=sk_test_... CLERK_SECRET_KEY=sk_live_... \
 *   npx tsx scripts/generate-merge-pairs-from-clerk.ts
 *
 * Or set both in .env (use CLERK_SECRET_KEY for live; add CLERK_SECRET_KEY_TEST
 * from Clerk Dashboard → your Test application → API Keys).
 *
 * Output: writes merge-pairs.csv in the current directory (or set OUTPUT_CSV path).
 * Only includes pairs where the same email exists in BOTH test and live.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const LIVE_SECRET = process.env.CLERK_SECRET_KEY;
const TEST_SECRET = process.env.CLERK_SECRET_KEY_TEST;
const OUTPUT_CSV = process.env.OUTPUT_CSV || path.join(process.cwd(), 'merge-pairs.csv');

type ClerkUser = {
  id: string;
  email_addresses?: Array<{ id: string; email_address: string }>;
  emailAddresses?: Array<{ id: string; emailAddress: string }>;
  primary_email_address_id?: string;
  primaryEmailAddressId?: string;
};

function getPrimaryEmail(user: ClerkUser): string | null {
  const list = user.email_addresses ?? user.emailAddresses;
  if (!list?.length) return null;
  const primaryId = user.primary_email_address_id ?? user.primaryEmailAddressId;
  const primary = primaryId ? list.find((e: any) => e.id === primaryId) : list[0];
  const email = (primary as any)?.email_address ?? (primary as any)?.emailAddress;
  return email?.trim()?.toLowerCase() ?? null;
}

async function fetchAllUsers(secretKey: string): Promise<{ users: ClerkUser[]; totalCount: number }> {
  const users: ClerkUser[] = [];
  let offset = 0;
  const limit = 500;
  let totalCount = 0;
  while (true) {
    const url = `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Clerk API error: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as
      | { data?: ClerkUser[]; total_count?: number; totalCount?: number }
      | ClerkUser[];
    const data = Array.isArray(body) ? body : (body.data ?? []);
    const total = Array.isArray(body) ? 0 : (body.total_count ?? body.totalCount ?? 0);
    if (total > 0) totalCount = total;
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

  const liveByEmail = new Map<string, string>();
  let liveNoEmail = 0;
  for (const u of liveUsers) {
    const email = getPrimaryEmail(u);
    if (email) liveByEmail.set(email, u.id);
    else liveNoEmail++;
  }

  const pairs: Array<{ testId: string; liveId: string; email: string }> = [];
  let testNoEmail = 0;
  let testNoMatch = 0;
  for (const u of testUsers) {
    const email = getPrimaryEmail(u);
    if (!email) {
      testNoEmail++;
      continue;
    }
    const liveId = liveByEmail.get(email);
    if (!liveId) {
      testNoMatch++;
      continue;
    }
    if (liveId !== u.id) pairs.push({ testId: u.id, liveId, email });
  }

  console.log('Matched by email:', pairs.length, 'pairs');
  if (testNoEmail > 0) console.log('  (Test users with no primary email:', testNoEmail + ')');
  if (testNoMatch > 0) console.log('  (Test users with email but no matching Live user:', testNoMatch + ')');
  if (liveNoEmail > 0) console.log('  (Live users with no primary email:', liveNoEmail + ')');

  const lines = ['test_user_id,live_user_id', ...pairs.map((p) => `${p.testId},${p.liveId}`)];
  fs.writeFileSync(OUTPUT_CSV, lines.join('\n') + '\n', 'utf-8');
  console.log('Wrote', OUTPUT_CSV);
  console.log('Run: MERGE_PAIRS_CSV=' + path.basename(OUTPUT_CSV) + ' npx tsx scripts/merge-test-user-into-live.ts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
