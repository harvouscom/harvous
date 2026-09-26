/**
 * Additive schema stage for church ministries (docs/CHURCH_V2_ROADMAP.md §C). Dry-run by
 * default; `--apply` executes.
 *
 * Two new tables and two nullable columns on `Spaces`. **Apply before any code that declares
 * them runs** — Drizzle selects every declared column, so every full-row read of `Spaces` (which
 * is most of the app) fails against a database without them.
 *
 *   - `Spaces.ministryId`: which ministry a channel or church group belongs to. Null = church-wide.
 *   - `Spaces.audience`: who may see a channel — 'church' (everyone connected, today's default),
 *     'ministry' or 'leaders'. Added now so the restricted-channels step needs no second migration.
 *
 * Every statement is idempotent (IF NOT EXISTS), and the set runs in one transaction.
 *
 *   npm run church-ministries:schema           # print the DDL, touch nothing
 *   npm run church-ministries:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_CHURCH_MINISTRIES_DDL = [
  `CREATE TABLE IF NOT EXISTS "ChurchMinistries" (
    "id" text PRIMARY KEY,
    "orgId" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "sortOrder" integer NOT NULL DEFAULT 0,
    "createdByUserId" text NOT NULL,
    "archivedAt" timestamptz,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "ChurchMinistries_orgIdIndex" ON "ChurchMinistries" ("orgId")`,
  // One live ministry per name per church; an archived one frees its name.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchMinistries_org_name_live_unique" ON "ChurchMinistries" ("orgId", lower("name")) WHERE "archivedAt" IS NULL`,
  `ALTER TABLE "ChurchMinistries" ENABLE ROW LEVEL SECURITY`,
  `CREATE TABLE IF NOT EXISTS "ChurchMinistryStaff" (
    "id" text PRIMARY KEY,
    "orgId" text NOT NULL,
    "ministryId" text NOT NULL,
    "userId" text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchMinistryStaff_ministry_user_unique" ON "ChurchMinistryStaff" ("ministryId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "ChurchMinistryStaff_org_userIndex" ON "ChurchMinistryStaff" ("orgId", "userId")`,
  `ALTER TABLE "ChurchMinistryStaff" ENABLE ROW LEVEL SECURITY`,
  // Nullable: every existing space is church-wide until someone says otherwise.
  `ALTER TABLE "Spaces" ADD COLUMN IF NOT EXISTS "ministryId" text`,
  `CREATE INDEX IF NOT EXISTS "Spaces_ministryIdIndex" ON "Spaces" ("ministryId")`,
  // Everyone connected, which is what every channel is today.
  `ALTER TABLE "Spaces" ADD COLUMN IF NOT EXISTS "audience" text NOT NULL DEFAULT 'church'`,
] as const;

export async function runAddChurchMinistriesSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[church-ministries:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_CHURCH_MINISTRIES_DDL) console.log(`${statement};`);
    console.log('[church-ministries:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'church-ministries:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_CHURCH_MINISTRIES_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[church-ministries:schema] applied ${ADDITIVE_CHURCH_MINISTRIES_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddChurchMinistriesSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[church-ministries:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
