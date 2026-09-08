/**
 * Additive schema stage for shared-space study suggestions. Dry-run by
 * default; `--apply` executes.
 *
 * Same shape and same reason as add-resource-library-schema.ts: `drizzle-kit
 * push` diffs the whole schema and, on a dev database carrying another
 * branch's tables, offers to drop them. This only ever adds, so it is safe
 * against a shared database mid-flight, and it is what recreates the table on
 * a fresh machine.
 *
 * Every statement is idempotent (IF NOT EXISTS), and the set runs in one
 * transaction.
 *
 *   npm run space-suggestions:schema           # print the DDL, touch nothing
 *   npm run space-suggestions:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL = [
  // The per-room switch. Default off: a room that never wanted this never
  // sees it. 'vote' is reserved for phase 2 and refused by the write route.
  `ALTER TABLE "Spaces" ADD COLUMN IF NOT EXISTS "studyPlanningMode" text NOT NULL DEFAULT 'off'`,
  // Attributed on purpose — see the docblock on the table in schema.ts. The
  // name is read only by the leader-gated queue.
  `CREATE TABLE IF NOT EXISTS "SpaceStudySuggestions" (
    "id" text PRIMARY KEY,
    "spaceId" text NOT NULL,
    "suggestedByUserId" text NOT NULL,
    "kind" text NOT NULL,
    "refId" text,
    "scriptureReference" text,
    "body" text,
    "status" text NOT NULL DEFAULT 'open',
    "becameThreadId" text,
    "reviewedByUserId" text,
    "reviewedAt" timestamptz,
    "leaderReadAt" timestamptz,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "SpaceStudySuggestions_space_status_createdAtIndex" ON "SpaceStudySuggestions" ("spaceId", "status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SpaceStudySuggestions_suggestedBy_createdAtIndex" ON "SpaceStudySuggestions" ("suggestedByUserId", "createdAt")`,
  // Matches scripts/run-enable-rls.ts, so a fresh apply leaves no window where
  // the table exists unprotected.
  `ALTER TABLE "SpaceStudySuggestions" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddSpaceStudySuggestionsSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[space-suggestions:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL) console.log(`${statement};`);
    console.log('[space-suggestions:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'space-suggestions:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[space-suggestions:schema] applied ${ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddSpaceStudySuggestionsSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error(
      '[space-suggestions:schema] failed:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
