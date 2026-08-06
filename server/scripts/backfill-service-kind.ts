/**
 * Finish the `ChurchServices.kind` migration: reclassify channel rows, and
 * narrow the one-per-date index to gatherings.
 *
 * **The index half is not optional, and `db:sync` will not do it.** drizzle-kit
 * push adds the column and updates the index's *columns*, but it does not
 * notice a changed `WHERE` predicate — verified against a live database, where
 * the index came back still reading `WHERE (spaceId IS NOT NULL)` after a
 * successful push. Left alone, a daily channel still cannot publish twice in a
 * day, which is the entire reason `kind` exists.
 *
 * `ChurchServices.kind` ships defaulting to `'gathering'`, which is right for
 * the church plan and for church Shared Spaces and wrong for every ministry
 * channel — a channel publishes on a cadence, it does not meet. A channel row
 * written before the column existed is the same product object as one written
 * after it, so leaving those rows `'gathering'` would keep the one-per-date
 * index and the gathering vocabulary applied to exactly the rows this column
 * exists to reclassify.
 *
 * Nothing is created or destroyed: the set of planned entries is identical
 * before and after, and only their `kind` changes. Idempotent — rows already
 * marked `'content'` are excluded, so a second run reports zero.
 *
 * Run AFTER `npm run db:sync` (which adds the column and narrows the unique
 * index to gatherings). The window between the two is benign: channel rows
 * briefly satisfy an index they already satisfied before.
 *
 * Dry run:  npx tsx server/scripts/backfill-service-kind.ts
 * Apply:    npx tsx server/scripts/backfill-service-kind.ts --apply
 */

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { db, ChurchServices, Spaces, and, eq, isNotNull, inArray, sql } from '../db';

async function main() {
  const apply = process.argv.includes('--apply');

  /*
    A ministry channel is `type='public'` + `orgId` set — the same discriminator
    `isMinistryBroadcastSpaceRow` uses. Church Shared Spaces (`type='shared'`)
    genuinely gather, so they keep 'gathering'.
  */
  const channelSpaces = await db
    .select({ id: Spaces.id, title: Spaces.title })
    .from(Spaces)
    .where(and(eq(Spaces.type, 'public'), isNotNull(Spaces.orgId)));

  if (channelSpaces.length === 0) {
    console.log('No ministry channels exist — nothing to reclassify.');
    return;
  }

  const channelIds = channelSpaces.map((s) => s.id);
  const candidates = await db
    .select({ id: ChurchServices.id, spaceId: ChurchServices.spaceId, title: ChurchServices.title })
    .from(ChurchServices)
    .where(and(inArray(ChurchServices.spaceId, channelIds), eq(ChurchServices.kind, 'gathering')));

  console.log(`Ministry channels: ${channelSpaces.length}`);
  console.log(`Plan rows still marked 'gathering': ${candidates.length}`);

  if (candidates.length === 0) {
    console.log('Every channel row is already content.');
    if (apply) await narrowSpaceDateIndex();
    else console.log('\nDry run. Re-run with --apply to check the index.');
    return;
  }

  for (const row of candidates) {
    const space = channelSpaces.find((s) => s.id === row.spaceId);
    console.log(`  ${row.id}  ${space?.title ?? row.spaceId} — ${row.title}`);
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to reclassify these rows and narrow the index.');
    return;
  }

  await db
    .update(ChurchServices)
    .set({ kind: 'content' })
    .where(and(inArray(ChurchServices.spaceId, channelIds), eq(ChurchServices.kind, 'gathering')));

  const [remaining] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ChurchServices)
    .where(and(inArray(ChurchServices.spaceId, channelIds), eq(ChurchServices.kind, 'gathering')));

  console.log(`\nReclassified ${candidates.length} row(s) to 'content'.`);
  console.log(`Channel rows still marked 'gathering': ${remaining?.count ?? 0} (expected 0).`);

  await narrowSpaceDateIndex();
}

/**
 * Rebuild the partial unique so it covers gatherings only.
 *
 * Run after the reclassification above, never before: while channel rows are
 * still `'gathering'`, two of them sharing a date would make the CREATE fail.
 * Afterwards the new predicate is a strict subset of the old one, so it cannot
 * find a violation the old index was not already enforcing.
 *
 * Idempotent — checks the live predicate first and does nothing if it already
 * mentions `kind`.
 */
async function narrowSpaceDateIndex(): Promise<void> {
  const current = await db.execute(
    sql`select indexdef from pg_indexes where indexname = 'ChurchServices_space_date_unique'`,
  );
  const def = (current as unknown as { indexdef?: string }[])[0]?.indexdef ?? '';

  if (!def) {
    console.log("\nIndex 'ChurchServices_space_date_unique' not found — skipping.");
    return;
  }
  if (def.includes('kind')) {
    console.log('\nIndex already narrowed to gatherings — nothing to do.');
    return;
  }

  console.log('\nNarrowing ChurchServices_space_date_unique to gatherings…');
  await db.execute(sql`DROP INDEX IF EXISTS "ChurchServices_space_date_unique"`);
  await db.execute(
    sql`CREATE UNIQUE INDEX "ChurchServices_space_date_unique"
        ON "ChurchServices" ("spaceId", "serviceDate")
        WHERE "spaceId" IS NOT NULL AND "kind" = 'gathering'`,
  );

  const after = await db.execute(
    sql`select indexdef from pg_indexes where indexname = 'ChurchServices_space_date_unique'`,
  );
  console.log((after as unknown as { indexdef?: string }[])[0]?.indexdef ?? '(missing)');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Backfill failed:', error);
      process.exit(1);
    });
}
