/**
 * One-time batch merge: for every ClerkUserMapping row not yet migrated,
 * merge dev → live so Turso has only live user IDs (no duplicate users).
 * Run after audit + fix-clerk-mapping-row for any wrong dev=live rows.
 *
 * Usage (from repo root, with production DB credentials in .env):
 *   npx tsx scripts/batch-merge-mapped-users-to-live.ts
 *
 * Requires: ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN.
 */
import 'dotenv/config';
import { db, ClerkUserMapping } from '../server/db';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { mergeDevUserIntoLive } from '../server/utils/merge-user-into-live';
import { nowISO } from '../server/db/dates';

async function main() {
  const toMerge = await db
    .select()
    .from(ClerkUserMapping)
    .where(
      and(
        isNull(ClerkUserMapping.migratedToLiveAt),
        isNotNull(ClerkUserMapping.liveUserId)
      )
    )
    .all();

  const eligible = toMerge.filter((r) => r.devUserId !== r.liveUserId);
  if (eligible.length === 0) {
    console.log('No unmigrated mapping rows with dev != live and liveUserId set. Nothing to do.');
    return;
  }

  console.log(`Merging ${eligible.length} user(s) dev → live...\n`);
  for (const row of eligible) {
    const liveId = row.liveUserId!;
    console.log('Merging', row.devUserId, '→', liveId, `(${row.email})`);
    await mergeDevUserIntoLive(row.devUserId, liveId, (msg) => console.log(' ', msg));
    await db
      .update(ClerkUserMapping)
      .set({ migratedToLiveAt: nowISO() })
      .where(eq(ClerkUserMapping.devUserId, row.devUserId));
    console.log(' Done.\n');
  }
  console.log('Batch merge done. Turso now has only live user IDs for these users.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
