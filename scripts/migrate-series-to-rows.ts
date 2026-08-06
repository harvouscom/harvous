/**
 * Promote `ChurchServices.seriesTitle` from a repeated string to `ChurchSeries`
 * rows, and point every sermon at its row.
 *
 * Why the string had to go, and what the row buys, is
 * `docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md` §9. This is the
 * one-time move.
 *
 * Runs as raw DDL rather than `db:push` because the two halves are ordered: the
 * new table and column must exist *before* the old column can be read, and the
 * old column must be read *before* it is dropped. A push generated from the
 * finished schema would do all three at once and lose every series title.
 *
 * Idempotent at each step — the table, index and column are `IF NOT EXISTS`, the
 * backfill only touches sermons whose `seriesId` is still NULL, and the drop is
 * skipped once `seriesTitle` is gone. Safe to re-run after a partial failure.
 *
 * Series are scoped per plan (`churchId` + nullable `spaceId`), so the same
 * title under the church plan and under Youth becomes two rows, exactly as the
 * design requires. Case collisions inside one plan collapse to the most recent
 * spelling — that fork is what the row exists to prevent, so it is resolved in
 * the church's favour rather than preserved.
 *
 *   npx tsx scripts/migrate-series-to-rows.ts          # report only
 *   npx tsx scripts/migrate-series-to-rows.ts --apply  # write
 *
 * If this fails with `EMAXCONNSESSION … pool_size: 15`, the Supabase pooler is
 * saturated rather than anything being wrong here — stop a dev server and
 * re-run. See the note in backfill-church-country.ts.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

type PendingSeries = {
  churchId: string;
  spaceId: string | null;
  /** The spelling to keep — the most recently dated one in this plan. */
  title: string;
  /** Every spelling that collapses into it, for the report and the update. */
  spellings: string[];
  services: number;
};

async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    LIMIT 1
  `);
  return rows.length > 0;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const say = (line: string) => console.log(line);

  if (!(await hasColumn('ChurchServices', 'seriesTitle'))) {
    say('seriesTitle is already gone — nothing to migrate.');
    process.exit(0);
  }

  // ── 1. Structure ───────────────────────────────────────────────────────────
  if (apply) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "ChurchSeries" (
        "id" text PRIMARY KEY,
        "churchId" text NOT NULL,
        "spaceId" text,
        "title" text NOT NULL,
        "createdBy" text NOT NULL,
        "createdAt" timestamp with time zone NOT NULL,
        "updatedAt" timestamp with time zone
      )
    `);
    // Two partial indexes, one per plan scope — a plain unique index would treat
    // every NULL spaceId as distinct and leave the church plan unconstrained.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "ChurchSeries_church_title_unique"
      ON "ChurchSeries" ("churchId", lower("title")) WHERE "spaceId" IS NULL
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "ChurchSeries_space_title_unique"
      ON "ChurchSeries" ("spaceId", lower("title")) WHERE "spaceId" IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "ChurchSeries_churchIdIndex" ON "ChurchSeries" ("churchId")
    `);
    await db.execute(sql`
      ALTER TABLE "ChurchServices" ADD COLUMN IF NOT EXISTS "seriesId" text
    `);
    say('Structure: ChurchSeries + indexes + ChurchServices.seriesId ready.');
  } else {
    say('Structure: would create ChurchSeries (+3 indexes) and ChurchServices.seriesId.');
  }

  // ── 2. What becomes a row ──────────────────────────────────────────────────
  // Grouped case-insensitively inside a plan; the kept spelling is the one on
  // the latest-dated sermon, matching `deriveSeriesTitles`' recency preference.
  const groups = await db.execute<{
    churchId: string;
    spaceId: string | null;
    title: string;
    spellings: string[];
    services: number;
    createdBy: string;
  }>(sql`
    SELECT DISTINCT ON ("churchId", "spaceId", lower(btrim("seriesTitle")))
      "churchId",
      "spaceId",
      btrim("seriesTitle") AS "title",
      array(
        SELECT DISTINCT btrim(inner_s."seriesTitle")
        FROM "ChurchServices" inner_s
        WHERE inner_s."churchId" = outer_s."churchId"
          AND inner_s."spaceId" IS NOT DISTINCT FROM outer_s."spaceId"
          AND lower(btrim(inner_s."seriesTitle")) = lower(btrim(outer_s."seriesTitle"))
      ) AS "spellings",
      (
        SELECT count(*)::int
        FROM "ChurchServices" c
        WHERE c."churchId" = outer_s."churchId"
          AND c."spaceId" IS NOT DISTINCT FROM outer_s."spaceId"
          AND lower(btrim(c."seriesTitle")) = lower(btrim(outer_s."seriesTitle"))
      ) AS "services",
      "createdBy"
    FROM "ChurchServices" outer_s
    WHERE btrim(coalesce("seriesTitle", '')) <> ''
    ORDER BY "churchId", "spaceId", lower(btrim("seriesTitle")), "serviceDate" DESC
  `);

  const pending = groups as unknown as (PendingSeries & { createdBy: string })[];
  say(`\nSeries to create: ${pending.length}`);
  for (const g of pending) {
    const scope = g.spaceId ? `space ${g.spaceId}` : 'church plan';
    const forked = g.spellings.length > 1 ? `  (collapses ${g.spellings.length} spellings: ${g.spellings.join(' | ')})` : '';
    say(`  ${g.churchId} · ${scope} · "${g.title}" — ${g.services} sermon(s)${forked}`);
  }

  if (!apply) {
    say('\nReport only. Re-run with --apply to write.');
    process.exit(0);
  }

  // ── 3. Rows, then pointers ─────────────────────────────────────────────────
  let created = 0;
  let pointed = 0;
  for (const g of pending) {
    const id = `csrs_${randomUUID()}`;
    const inserted = await db.execute<{ id: string }>(sql`
      INSERT INTO "ChurchSeries" ("id", "churchId", "spaceId", "title", "createdBy", "createdAt")
      VALUES (${id}, ${g.churchId}, ${g.spaceId}, ${g.title}, ${g.createdBy}, now())
      ON CONFLICT DO NOTHING
      RETURNING "id"
    `);
    if (inserted.length > 0) created++;

    // Re-read rather than trusting the insert: a re-run finds the existing row.
    const found = await db.execute<{ id: string }>(sql`
      SELECT "id" FROM "ChurchSeries"
      WHERE "churchId" = ${g.churchId}
        AND "spaceId" IS NOT DISTINCT FROM ${g.spaceId}
        AND lower("title") = lower(${g.title})
      LIMIT 1
    `);
    const seriesId = found[0]?.id;
    if (!seriesId) throw new Error(`No series row for "${g.title}" after insert`);

    const updated = await db.execute<{ id: string }>(sql`
      UPDATE "ChurchServices" SET "seriesId" = ${seriesId}
      WHERE "churchId" = ${g.churchId}
        AND "spaceId" IS NOT DISTINCT FROM ${g.spaceId}
        AND lower(btrim("seriesTitle")) = lower(${g.title})
        AND "seriesId" IS NULL
      RETURNING "id"
    `);
    pointed += updated.length;
  }
  say(`\nCreated ${created} series; pointed ${pointed} sermon(s).`);

  // ── 4. The old column ──────────────────────────────────────────────────────
  const orphans = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM "ChurchServices"
    WHERE btrim(coalesce("seriesTitle", '')) <> '' AND "seriesId" IS NULL
  `);
  const orphanCount = Number(orphans[0]?.n ?? 0);
  if (orphanCount > 0) {
    throw new Error(
      `${orphanCount} sermon(s) still carry a seriesTitle with no seriesId — refusing to drop the column.`,
    );
  }

  await db.execute(sql`ALTER TABLE "ChurchServices" DROP COLUMN IF EXISTS "seriesTitle"`);
  say('Dropped ChurchServices.seriesTitle.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
