/**
 * Additive tradition stage. Dry-run by default; `--apply` executes.
 *
 * Adds `UserMetadata.tradition`, the Protestant/Catholic setting. Run it BEFORE deploying the code
 * that names the column: Drizzle's `select()` without a column list expands to every column in
 * the schema file, so against a database lacking this one `/api/user/get-profile` and every other
 * whole-row read of UserMetadata fails for every signed-in user. Fly deploys don't run `db:push`.
 *
 * Why this rather than `db:push`: push diffs the whole schema and offers to drop another
 * in-flight branch's tables. This script only ever adds, idempotently, in one transaction.
 *
 *   npm run tradition:schema         # print the DDL, touch nothing
 *   npm run tradition:schema:apply   # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_TRADITION_DDL = [
  // 'protestant' | 'catholic', read by normalizeTradition (src/utils/tradition.ts). Null = never chosen.
  `ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "tradition" text`,
] as const;

export async function runAddTraditionSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[tradition:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_TRADITION_DDL) console.log(`${statement};`);
    console.log('[tradition:schema] review, then re-run with --apply');
    return;
  }
  // Only past the dry run: printing the DDL connects to nothing.
  requireDbTarget({ scriptName: 'tradition:schema', writes: true, argv, env });

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
      for (const statement of ADDITIVE_TRADITION_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[tradition:schema] applied ${ADDITIVE_TRADITION_DDL.length} idempotent statement(s)`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddTraditionSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error(
      '[tradition:schema] failed:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
