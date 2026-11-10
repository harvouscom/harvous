/** Preview by default. Uses Clerk pagination, including Free users so stale copies can be cleared. */
import { createClerkClient } from '@clerk/backend';
import { getPolarServer } from '../utils/polar-client';
import { syncBillingContact } from '../utils/billing-contact-sync';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const value = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
const environment = value('environment');
const offset = Number(value('offset') ?? 0);
const limit = Number(value('limit') ?? 25);
if (!['sandbox', 'production'].includes(environment ?? '') || environment !== getPolarServer()) {
  throw new Error('Pass --environment=sandbox|production matching POLAR_ENV');
}
if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error('Use --offset >= 0 and --limit=1..100');
}
const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey?.startsWith(environment === 'production' ? 'sk_live_' : 'sk_test_')) {
  throw new Error('Clerk key must match the selected billing environment');
}
if (apply && !process.env.AUDIENCEFUL_API_KEY) throw new Error('AUDIENCEFUL_API_KEY is required');
const clerk = createClerkClient({ secretKey });
const { data: users, totalCount } = await clerk.users.getUserList({ limit, offset, orderBy: '+created_at' });
let failed = 0;
for (const user of users) {
  try {
    const fields = await syncBillingContact(user.id, { apply });
    console.log(JSON.stringify({ userId: user.id, apply, ...fields }));
  } catch (error) {
    failed++;
    console.error(JSON.stringify({ userId: user.id, error: error instanceof Error ? error.message : String(error) }));
  }
}
console.log(JSON.stringify({ apply, processed: users.length, failed, nextOffset: offset + users.length, totalCount }));
if (failed) process.exitCode = 1;
