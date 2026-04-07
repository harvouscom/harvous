/**
 * Grant a Clerk user membership on a Harvous system-owned shared space (e.g. Easter 2026)
 * so they can open curated threads while signed in as that user.
 *
 * Prerequisites:
 * - API running (default http://localhost:3001) or HARVOUS_GRANT_API_BASE
 * - .env: HARVOUS_ADMIN_SECRET, HARVOUS_SYSTEM_USER_ID
 * - Env: HARVOUS_GRANT_USER_ID=<Clerk user id to add> (e.g. user_2abc...)
 * - Env: HARVOUS_GRANT_SPACE_ID=<space_...> (default: EASTER_2026_SPACE_ID or space from docs example)
 *
 * Usage:
 *   HARVOUS_GRANT_USER_ID=user_xxx npm run harvous:grant-space-member
 *   HARVOUS_GRANT_SPACE_ID=space_yyy HARVOUS_GRANT_USER_ID=user_xxx npx tsx scripts/grant-harvous-space-member.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
config({ path: resolve(root, '.env') });

const DEFAULT_EASTER_SPACE = 'space_1775233360402';

async function adminFetch(base: string, secret: string, path: string, init?: RequestInit) {
  const url = `${base.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

async function main() {
  const secret = process.env.HARVOUS_ADMIN_SECRET;
  const userId = process.env.HARVOUS_GRANT_USER_ID?.trim();
  const spaceId =
    process.env.HARVOUS_GRANT_SPACE_ID?.trim() ||
    process.env.EASTER_2026_SPACE_ID?.trim() ||
    DEFAULT_EASTER_SPACE;
  const base = (process.env.HARVOUS_GRANT_API_BASE || process.env.EASTER_PUBLISH_API_BASE || 'http://localhost:3001').replace(
    /\/$/,
    '',
  );

  if (!secret) {
    console.error('HARVOUS_ADMIN_SECRET not set.');
    process.exit(1);
  }
  if (!userId) {
    console.error('Set HARVOUS_GRANT_USER_ID to the Clerk user id (e.g. user_2abc...) to add as a member.');
    process.exit(1);
  }

  console.log('Granting membership: space', spaceId, '→ user', userId);
  const res = (await adminFetch(base, secret, `/api/admin/spaces/${encodeURIComponent(spaceId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })) as { success?: boolean; alreadyMember?: boolean; error?: string };
  if (res.alreadyMember) {
    console.log('Already a member — no change.');
  } else {
    console.log('Done. Sign in as that user and open the space from Shared / dashboard.');
  }
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
