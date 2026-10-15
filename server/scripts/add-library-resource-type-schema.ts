/**
 * Additive schema stage for library resource types. Dry-run by default; `--apply` executes.
 *
 * Same shape and same reason as add-space-study-suggestions-schema.ts: `drizzle-kit push`
 * diffs the whole schema and, run from a branch behind main, offers to drop main's newer
 * tables. This only ever adds one nullable column, so it is safe against the shared database
 * while the code that reads it is still on a branch — the code that is live today ignores it.
 *
 * Run it BEFORE deploying the branch: the library routes select whole rows, and Drizzle
 * expands that to every column in schema.ts, so the new code 500s on a database without it.
 *
 *   npm run library-resource-type:schema           # print the DDL, touch nothing
 *   npm run library-resource-type:schema:apply     # run it
 *
 * Then type the rows saved before this existed:
 *   npx tsx server/scripts/backfill-library-resource-types.ts [--apply]
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_LIBRARY_RESOURCE_TYPE_DDL = [
  // Nullable on purpose — see the column's docblock in schema.ts.
  `ALTER TABLE "LibraryItems" ADD COLUMN IF NOT EXISTS "resourceType" text`,
] as const;

export async function runAddLibraryResourceTypeSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[library-resource-type:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_LIBRARY_RESOURCE_TYPE_DDL) console.log(`${statement};`);
    console.log('[library-resource-type:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'library-resource-type:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_LIBRARY_RESOURCE_TYPE_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[library-resource-type:schema] applied ${ADDITIVE_LIBRARY_RESOURCE_TYPE_DDL.length} idempotent statement(s)`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddLibraryResourceTypeSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[library-resource-type:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
