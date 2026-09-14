/**
 * Additive Review exercise-settings stage. Dry-run by default; `--apply` executes.
 *
 * What it is for: `UserMetadata.reviewExerciseSettings` has been in `schema.ts` since the exercise
 * settings page shipped, but it reached databases by `db:push` and nothing recorded that a database
 * needs it. It carries each family's emphasis now rather than one skip-list — still a nullable text
 * column, so there is no DDL change, only a record of the one statement a database that predates it
 * has to run.
 *
 * Why it matters before a deploy rather than after: Drizzle's `select()` without a column list
 * expands to every column in the schema file, so against a database lacking this one,
 * `/api/user/get-profile` fails for every signed-in user — not only the few who opened the page.
 *
 * Why this rather than `db:push`: push diffs the *whole* schema against the target, and on a
 * database carrying tables from another in-flight branch that diff offers to drop them. This
 * script only ever adds.
 *
 * Idempotent (IF NOT EXISTS), so re-running is a no-op, and run in one transaction like the rest.
 *
 *   npm run review-exercises:schema         # print the DDL, touch nothing
 *   npm run review-exercises:schema:apply   # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_REVIEW_EXERCISE_SETTINGS_DDL = [
  // JSON, parsed tolerantly by src/utils/review-exercise-settings.ts. Null = never set.
  `ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "reviewExerciseSettings" text`,
] as const;

export async function runAddReviewExerciseSettingsSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[review-exercises:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_REVIEW_EXERCISE_SETTINGS_DDL) console.log(`${statement};`);
    console.log('[review-exercises:schema] review, then re-run with --apply');
    return;
  }
  // Only past the dry run: printing the DDL connects to nothing.
  requireDbTarget({ scriptName: 'review-exercises:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  // max: 1 — the shared dev pooler caps session-mode clients, and a migration
  // has no reason to hold more than one.
  // onnotice — on a re-run every statement emits "already exists, skipping",
  // which is the expected outcome here and would otherwise bury the result.
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_REVIEW_EXERCISE_SETTINGS_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[review-exercises:schema] applied ${ADDITIVE_REVIEW_EXERCISE_SETTINGS_DDL.length} idempotent statement(s)`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddReviewExerciseSettingsSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error(
      '[review-exercises:schema] failed:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
