/**
 * Additive schema stage for church review exercises. Dry-run by default; `--apply` executes.
 *
 * One new table and two nullable columns on `ReviewItems`. **Apply before the code that
 * declares them ships**: Drizzle selects every declared column, so every full-row read of
 * `ReviewItems` fails against a database without them — all of Review, not just the church
 * part.
 *
 * Every statement is idempotent (IF NOT EXISTS), and the set runs in one transaction.
 *
 *   npm run church-review:schema           # print the DDL, touch nothing
 *   npm run church-review:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_CHURCH_REVIEW_DDL = [
  `CREATE TABLE IF NOT EXISTS "ChurchReviewExercises" (
    "id" text PRIMARY KEY,
    "churchId" text NOT NULL,
    "orgId" text NOT NULL,
    "channelSpaceId" text NOT NULL,
    "kind" text NOT NULL,
    "prompt" text,
    "content" text,
    "scriptureReference" text,
    "translation" text,
    "origin" text NOT NULL,
    "suggestionKey" text,
    "sourceNoteId" text,
    "sourceServiceId" text,
    "sourceSeriesId" text,
    "status" text NOT NULL DEFAULT 'draft',
    "version" integer NOT NULL DEFAULT 1,
    "answeredCount" integer NOT NULL DEFAULT 0,
    "createdBy" text NOT NULL,
    "updatedBy" text,
    "publishedAt" timestamptz,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "ChurchReviewExercises_channel_statusIndex" ON "ChurchReviewExercises" ("channelSpaceId", "status")`,
  `CREATE INDEX IF NOT EXISTS "ChurchReviewExercises_orgIdIndex" ON "ChurchReviewExercises" ("orgId")`,
  // One row per suggested passage per channel, whatever its status — so "dismissed" sticks.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchReviewExercises_channel_suggestion_unique" ON "ChurchReviewExercises" ("channelSpaceId", "suggestionKey") WHERE "suggestionKey" IS NOT NULL`,
  `ALTER TABLE "ChurchReviewExercises" ENABLE ROW LEVEL SECURITY`,
  // Nullable, no default: every existing row is simply not a church item.
  `ALTER TABLE "ReviewItems" ADD COLUMN IF NOT EXISTS "churchExerciseId" text`,
  `ALTER TABLE "ReviewItems" ADD COLUMN IF NOT EXISTS "churchExerciseVersion" integer`,
  `CREATE INDEX IF NOT EXISTS "ReviewItems_churchExerciseIdIndex" ON "ReviewItems" ("churchExerciseId")`,
] as const;

export async function runAddChurchReviewSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[church-review:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_CHURCH_REVIEW_DDL) console.log(`${statement};`);
    console.log('[church-review:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'church-review:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_CHURCH_REVIEW_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[church-review:schema] applied ${ADDITIVE_CHURCH_REVIEW_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddChurchReviewSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[church-review:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
