/**
 * Additive schema stage for church content lifecycle (docs/CHURCH_V2_ROADMAP.md §D). Dry-run by
 * default; `--apply` executes.
 *
 * One new table and one column on `Churches`. **Apply before any code that declares them runs**
 * — Drizzle selects every declared column, so every full-row read of `Churches` fails against a
 * database without `contentApproval`.
 *
 *   - `ChurchContentSubmissions`: channel material that is scheduled or waiting for approval.
 *   - `Churches.contentApproval`: whether teachers' material needs a pastor's approval. Off.
 *
 * Every statement is idempotent (IF NOT EXISTS), and the set runs in one transaction.
 *
 *   npm run church-content:schema           # print the DDL, touch nothing
 *   npm run church-content:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_CHURCH_CONTENT_DDL = [
  `CREATE TABLE IF NOT EXISTS "ChurchContentSubmissions" (
    "id" text PRIMARY KEY,
    "orgId" text NOT NULL,
    "channelSpaceId" text NOT NULL,
    "noteId" text NOT NULL,
    "authorUserId" text NOT NULL,
    "status" text NOT NULL,
    "publishAt" timestamptz,
    "reviewedByUserId" text,
    "reviewedAt" timestamptz,
    "reviewNote" text,
    "publishedAt" timestamptz,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "ChurchContentSubmissions_org_statusIndex" ON "ChurchContentSubmissions" ("orgId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ChurchContentSubmissions_status_publishAtIndex" ON "ChurchContentSubmissions" ("status", "publishAt")`,
  `CREATE INDEX IF NOT EXISTS "ChurchContentSubmissions_noteIdIndex" ON "ChurchContentSubmissions" ("noteId")`,
  // One open submission per note per channel.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchContentSubmissions_open_unique" ON "ChurchContentSubmissions" ("channelSpaceId", "noteId") WHERE "status" IN ('in_review', 'scheduled')`,
  `ALTER TABLE "ChurchContentSubmissions" ENABLE ROW LEVEL SECURITY`,
  // Off: every church publishes directly until an admin turns approval on.
  `ALTER TABLE "Churches" ADD COLUMN IF NOT EXISTS "contentApproval" boolean NOT NULL DEFAULT false`,
] as const;

export async function runAddChurchContentSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[church-content:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_CHURCH_CONTENT_DDL) console.log(`${statement};`);
    console.log('[church-content:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'church-content:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_CHURCH_CONTENT_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[church-content:schema] applied ${ADDITIVE_CHURCH_CONTENT_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddChurchContentSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[church-content:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
