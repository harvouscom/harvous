/**
 * One-off smoke test: create person, plant marketing tags, re-sync, assert User merge.
 * Usage: npx tsx scripts/verify-audienceful-upsert.ts
 */
import fs from 'fs';
import { APP_USER_TAG, tagAsAppUser, updateSubscriber } from '../src/utils/audienceful';

function getEnv(k: string): string | null {
  const t = fs.readFileSync('.env', 'utf8');
  const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'));
  if (!m) return null;
  let v = m[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

async function main() {
  const apiKey = getEnv('AUDIENCEFUL_API_KEY');
  if (!apiKey) throw new Error('AUDIENCEFUL_API_KEY missing in .env');
  process.env.AUDIENCEFUL_API_KEY = apiKey;

  const email = `harvous-sync-verify-${Date.now()}@example.com`;
  const clerkUserId = 'user_sync_verify_test';

  console.log('1) create', email);
  const created = await tagAsAppUser(email, clerkUserId, 'Sync', 'Verify');
  console.log('created', { id: created.id || created.uid, tags: (created.tags || []).map((t) => t.name) });

  await new Promise((r) => setTimeout(r, 1200));
  await updateSubscriber(email, { tags: 'pending, newsletter, User' });
  console.log('2) planted pending+newsletter+User');

  await new Promise((r) => setTimeout(r, 1200));
  const again = await tagAsAppUser(email, clerkUserId, 'Sync', 'Verify');
  const tagNames = (again.tags || []).map((t) => t.name);
  console.log('3) re-sync tags', tagNames);

  const hasUser = tagNames.some((t) => t.toLowerCase() === APP_USER_TAG.toLowerCase());
  const keptPending = tagNames.some((t) => t.toLowerCase() === 'pending');
  const keptNewsletter = tagNames.some((t) => t.toLowerCase() === 'newsletter');
  const ok = hasUser && keptPending && keptNewsletter;
  console.log('CHECK', { hasUser, keptPending, keptNewsletter, ok });
  console.log('VERIFY_EMAIL', email);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
