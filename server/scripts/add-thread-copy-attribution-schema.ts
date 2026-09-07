/**
 * Additive thread-copy attribution stage. Dry-run by default; `--apply` executes.
 *
 * What it is for: `/api/shared/add-to-harvous` copies a shared Thread and every
 * note in it, and until these columns existed it had nothing to key an "already
 * imported" check on. A second click on the same link forked a second Thread
 * plus a duplicate of every note. The child Notes have carried `copiedFrom*`
 * since shared spaces shipped; this brings the parent Thread level with them
 * and adds the unique index the import route now depends on.
 *
 * Why this rather than `db:push`: push diffs the *whole* schema against the
 * target, and on a database carrying tables from another in-flight branch that
 * diff offers to drop them. This script only ever adds.
 *
 * Every statement is idempotent (IF NOT EXISTS), so re-running is a no-op, and
 * the whole set runs in one transaction.
 *
 * The index is built inside that transaction rather than CONCURRENTLY, which is
 * safe here only because it is partial on a column that is NULL for every row
 * that already exists: the build matches nothing and the lock on "Threads" is
 * held for an instant. A later migration adding a *non*-partial index to this
 * table would not get to reason that way.
 *
 *   npm run thread-copy:schema         # print the DDL, touch nothing
 *   npm run thread-copy:schema:apply   # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL = [
  `ALTER TABLE "Threads" ADD COLUMN IF NOT EXISTS "copiedFromThreadId" text`,
  `ALTER TABLE "Threads" ADD COLUMN IF NOT EXISTS "copiedFromAuthorId" text`,
  // The duplicate guard. Partial, so it constrains imported Threads and leaves
  // every other row out of the index entirely. Also the read path for the
  // route's fast-path check, which looks up (userId, copiedFromThreadId).
  `CREATE UNIQUE INDEX IF NOT EXISTS "Threads_copiedFromThread_unique" ON "Threads" ("userId", "copiedFromThreadId") WHERE "copiedFromThreadId" IS NOT NULL`,
] as const;

export async function runAddThreadCopyAttributionSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[thread-copy:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL) console.log(`${statement};`);
    console.log('[thread-copy:schema] review, then re-run with --apply');
    return;
  }
  // Only past the dry run: printing the DDL connects to nothing.
  requireDbTarget({ scriptName: 'thread-copy:schema', writes: true, argv, env });

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
      for (const statement of ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[thread-copy:schema] applied ${ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddThreadCopyAttributionSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error(
      '[thread-copy:schema] failed:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
