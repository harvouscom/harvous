/**
 * Additive schema stage for church pilot readiness (docs/CHURCH_V2_ROADMAP.md, Lane G). Dry-run by
 * default; `--apply` executes.
 *
 * Three new tables and nothing else on any table that existed before them, so code that declares
 * them is safe to run before this is applied: every reader treats a missing table as "nothing chosen /
 * nothing tagged / no requests" (`isPgUndefinedRelation`).
 *
 *   - `ChurchServiceChoices`: the one service a congregant attends (day + time, natural key).
 *   - `ChurchServiceTimeSpaces`: channels and groups that meet during a service.
 *   - `ChurchApplications`: a church asking to join Harvous, approved by a Harvous admin.
 *
 * Every statement is idempotent (IF NOT EXISTS), and the set runs in one transaction.
 *
 *   npm run church-pilot:schema           # print the DDL, touch nothing
 *   npm run church-pilot:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_CHURCH_PILOT_DDL = [
  `CREATE TABLE IF NOT EXISTS "ChurchServiceChoices" (
    "userId" text PRIMARY KEY,
    "churchId" text,
    "hmcChurchId" text,
    "dayOfWeek" integer NOT NULL,
    "startTime" text NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "ChurchServiceChoices_churchIdIndex" ON "ChurchServiceChoices" ("churchId")`,
  `ALTER TABLE "ChurchServiceChoices" ENABLE ROW LEVEL SECURITY`,

  `CREATE TABLE IF NOT EXISTS "ChurchServiceTimeSpaces" (
    "id" text PRIMARY KEY,
    "churchId" text NOT NULL,
    "serviceTimeId" text NOT NULL,
    "spaceId" text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchServiceTimeSpaces_time_space_unique" ON "ChurchServiceTimeSpaces" ("serviceTimeId", "spaceId")`,
  `CREATE INDEX IF NOT EXISTS "ChurchServiceTimeSpaces_churchIdIndex" ON "ChurchServiceTimeSpaces" ("churchId")`,
  `ALTER TABLE "ChurchServiceTimeSpaces" ENABLE ROW LEVEL SECURITY`,

  `CREATE TABLE IF NOT EXISTS "ChurchApplications" (
    "id" text PRIMARY KEY,
    "hmcChurchId" text,
    "name" text NOT NULL,
    "city" text,
    "state" text,
    "country" text,
    "applicantUserId" text,
    "source" text NOT NULL DEFAULT 'app',
    "applicantName" text,
    "applicantRole" text,
    "contactEmail" text,
    "timezone" text,
    "notes" text,
    "status" text NOT NULL,
    "decidedByUserId" text,
    "decidedAt" timestamptz,
    "decisionNote" text,
    "churchId" text,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "ChurchApplications_statusIndex" ON "ChurchApplications" ("status")`,
  `CREATE INDEX IF NOT EXISTS "ChurchApplications_applicantIndex" ON "ChurchApplications" ("applicantUserId")`,
  // One open request per directory church, whoever sent it.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchApplications_hmc_pending_unique" ON "ChurchApplications" ("hmcChurchId") WHERE "status" = 'pending' AND "hmcChurchId" IS NOT NULL`,
  `ALTER TABLE "ChurchApplications" ENABLE ROW LEVEL SECURITY`,
  // Added for requests from the harvous.com form, which have no account yet (applied after the
  // first run; re-running the script brings an older table up to date).
  `ALTER TABLE "ChurchApplications" ALTER COLUMN "applicantUserId" DROP NOT NULL`,
  `ALTER TABLE "ChurchApplications" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'app'`,
  `ALTER TABLE "ChurchApplications" ADD COLUMN IF NOT EXISTS "applicantName" text`,
  `CREATE INDEX IF NOT EXISTS "ChurchApplications_contactEmailIndex" ON "ChurchApplications" (lower("contactEmail")) WHERE "applicantUserId" IS NULL`,
] as const;

export async function runAddChurchPilotSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[church-pilot:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_CHURCH_PILOT_DDL) console.log(`${statement};`);
    console.log('[church-pilot:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'church-pilot:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_CHURCH_PILOT_DDL) await tx.unsafe(statement);
    });
    console.log(`[church-pilot:schema] applied ${ADDITIVE_CHURCH_PILOT_DDL.length} idempotent statements`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddChurchPilotSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[church-pilot:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
