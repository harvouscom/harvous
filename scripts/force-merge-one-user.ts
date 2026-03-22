/**
 * Force merge dev → live for one user and set migratedToLiveAt.
 * Use when you fixed devUserId in ClerkUserMapping but migratedToLiveAt was
 * already set (so the middleware never ran the merge and old notes didn't carry over).
 *
 * Usage (from repo root, with production DB credentials in .env):
 *   LIVE_USER_ID=user_35FUJeL... npx tsx scripts/force-merge-one-user.ts
 * Or with both IDs:
 *   DEV_USER_ID=user_35TxUL... LIVE_USER_ID=user_35FUJeL... npx tsx scripts/force-merge-one-user.ts
 *
 * Requires: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (or ASTRO_DB_*).
 */
import 'dotenv/config';
import { db, ClerkUserMapping } from '../server/db';
import { first } from '../server/db/helpers';
import { eq } from 'drizzle-orm';
import { mergeDevUserIntoLive } from '../server/utils/merge-user-into-live';
import { nowISO } from '../server/db/dates';

async function main() {
  const liveId = process.env.LIVE_USER_ID?.trim();
  const devIdOverride = process.env.DEV_USER_ID?.trim();

  if (!liveId) {
    console.error('Set LIVE_USER_ID (your current Clerk Production ID, e.g. user_35FUJeL...).');
    process.exit(1);
  }

  const row = devIdOverride
    ? first(await db.select().from(ClerkUserMapping).where(eq(ClerkUserMapping.devUserId, devIdOverride)).limit(1))
    : first(await db.select().from(ClerkUserMapping).where(eq(ClerkUserMapping.liveUserId, liveId)).limit(1));

  if (!row) {
    console.error('No ClerkUserMapping row found for LIVE_USER_ID (or DEV_USER_ID). Run populate-clerk-user-mapping.ts and fix-clerk-mapping-row first.');
    process.exit(1);
  }

  const devId = row.devUserId;
  const targetLiveId = row.liveUserId ?? liveId;
  if (devId === targetLiveId) {
    console.error('devUserId and liveUserId are the same; nothing to merge. Fix the row with fix-clerk-mapping-row.ts first.');
    process.exit(1);
  }

  console.log('Merging', devId, '→', targetLiveId, `(${row.email})`);
  await mergeDevUserIntoLive(devId, targetLiveId, (msg) => console.log(' ', msg));
  await db
    .update(ClerkUserMapping)
    .set({ migratedToLiveAt: nowISO() })
    .where(eq(ClerkUserMapping.devUserId, devId));
  console.log('Done. Sign in again; you should see all notes under the live ID.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
