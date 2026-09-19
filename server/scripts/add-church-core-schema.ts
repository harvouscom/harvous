/**
 * Additive schema stage for the church core tables that had no DDL script.
 * Dry-run by default; `--apply` executes.
 *
 * `ChurchMemberships`, `ChurchServiceTimes`, `ChurchServiceTimeAssignments`
 * and `ChurchServices` existed only in schema.ts, so a fresh or partially
 * pushed database could get them only from a full `drizzle-kit push` — the
 * one that offers to drop tables from other branches. The other church tables
 * already have scripts (add-space-owned-plans, add-resource-library,
 * add-space-channel-links, manual/*.sql); this closes the set.
 *
 * Written to the tables' *current* shape (ChurchServices with nullable
 * churchId/serviceDate, its `kind` column and the room-plan partial index),
 * so on a database that already has them every statement is a no-op.
 * `ChurchMemberships` has no writers (multi-church is not built); it is here
 * so the schema is reproducible, not because anything uses it.
 *
 *   npm run church-core:schema           # print the DDL, touch nothing
 *   npm run church-core:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_CHURCH_CORE_DDL = [
  `CREATE TABLE IF NOT EXISTS "ChurchMemberships" (
    "id" text PRIMARY KEY,
    "churchId" text NOT NULL,
    "userId" text NOT NULL,
    "role" text NOT NULL DEFAULT 'member',
    "joinedAt" timestamptz NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchMemberships_church_user_unique" ON "ChurchMemberships" ("churchId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "ChurchMemberships_userIdIndex" ON "ChurchMemberships" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "ChurchMemberships_churchIdIndex" ON "ChurchMemberships" ("churchId")`,

  `CREATE TABLE IF NOT EXISTS "ChurchServiceTimes" (
    "id" text PRIMARY KEY,
    "churchId" text NOT NULL,
    "dayOfWeek" integer NOT NULL,
    "startTime" text NOT NULL,
    "label" text,
    "sortOrder" integer NOT NULL DEFAULT 0,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchServiceTimes_church_day_time_unique" ON "ChurchServiceTimes" ("churchId", "dayOfWeek", "startTime")`,
  `CREATE INDEX IF NOT EXISTS "ChurchServiceTimes_churchIdIndex" ON "ChurchServiceTimes" ("churchId")`,

  `CREATE TABLE IF NOT EXISTS "ChurchServiceTimeAssignments" (
    "id" text PRIMARY KEY,
    "serviceId" text NOT NULL,
    "serviceTimeId" text NOT NULL,
    "serviceDate" text NOT NULL,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchServiceTimeAssignments_slot_date_unique" ON "ChurchServiceTimeAssignments" ("serviceTimeId", "serviceDate")`,
  `CREATE INDEX IF NOT EXISTS "ChurchServiceTimeAssignments_serviceIdIndex" ON "ChurchServiceTimeAssignments" ("serviceId")`,
  `CREATE INDEX IF NOT EXISTS "ChurchServiceTimeAssignments_serviceDateIndex" ON "ChurchServiceTimeAssignments" ("serviceDate")`,

  `CREATE TABLE IF NOT EXISTS "ChurchServices" (
    "id" text PRIMARY KEY,
    "churchId" text,
    "spaceId" text,
    "serviceDate" text,
    "serviceTime" text,
    "title" text NOT NULL,
    "seriesId" text,
    "reference" text,
    "starterTemplateId" text,
    "kind" text NOT NULL DEFAULT 'gathering',
    "createdBy" text NOT NULL,
    "updatedBy" text,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "ChurchServices_church_dateIndex" ON "ChurchServices" ("churchId", "serviceDate")`,
  `CREATE INDEX IF NOT EXISTS "ChurchServices_spaceIdIndex" ON "ChurchServices" ("spaceId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchServices_space_date_unique" ON "ChurchServices" ("spaceId", "serviceDate") WHERE "spaceId" IS NOT NULL AND "kind" = 'gathering'`,

  // Matches scripts/run-enable-rls.ts: no window where a table exists unprotected.
  `ALTER TABLE "ChurchMemberships" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "ChurchServiceTimes" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "ChurchServiceTimeAssignments" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "ChurchServices" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddChurchCoreSchema(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[church-core:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_CHURCH_CORE_DDL) console.log(`${statement};`);
    console.log('[church-core:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'church-core:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_CHURCH_CORE_DDL) await tx.unsafe(statement);
    });
    console.log(`[church-core:schema] applied ${ADDITIVE_CHURCH_CORE_DDL.length} idempotent statements`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddChurchCoreSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[church-core:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
