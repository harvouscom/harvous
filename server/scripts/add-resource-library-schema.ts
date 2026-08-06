/**
 * Additive Resource Library schema stage. Dry-run by default; `--apply` executes.
 *
 * Why this exists rather than relying on `db:push`: these two tables are new and
 * additive, but `drizzle-kit push` diffs the *whole* schema against the target.
 * On a database that carries tables from another in-flight branch, that diff
 * offers to drop them. This script only ever adds, so it is safe to run against
 * a shared dev database while other branches are mid-flight — and it is the
 * thing that recreates the tables on a fresh machine.
 *
 * Every statement is idempotent (IF NOT EXISTS), so re-running is a no-op, and
 * the whole set runs in one transaction.
 *
 * Storage note: `kind='file'` items also need the private `library-files`
 * bucket — see supabase/storage-library-files.sql. That is a separate one-time
 * step because buckets live outside the Postgres schema.
 *
 *   npm run library:schema           # print the DDL, touch nothing
 *   npm run library:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';

export const ADDITIVE_RESOURCE_LIBRARY_DDL = [
  `CREATE TABLE IF NOT EXISTS "ResourceLibraries" (
    "id" text PRIMARY KEY,
    "ownerKind" text NOT NULL,
    "ownerId" text NOT NULL,
    "title" text NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  // Not just a constraint: this is the race guard the lazy-creation path in
  // server/routes/library.ts relies on — concurrent first-saves collide here
  // and the loser re-reads instead of forking a second library.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ResourceLibraries_owner_unique" ON "ResourceLibraries" ("ownerKind", "ownerId")`,
  `CREATE TABLE IF NOT EXISTS "LibraryItems" (
    "id" text PRIMARY KEY,
    "libraryId" text NOT NULL,
    "kind" text NOT NULL DEFAULT 'link',
    "title" text NOT NULL,
    "description" text,
    "sourceUrl" text,
    "sourceDomain" text,
    "sourceSiteName" text,
    "sourceImage" text,
    "fileStorageKey" text,
    "fileName" text,
    "fileMime" text,
    "fileBytes" integer,
    "access" text NOT NULL DEFAULT 'members',
    "createdByUserId" text NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz,
    "archivedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "LibraryItems_libraryId_archivedAtIndex" ON "LibraryItems" ("libraryId", "archivedAt")`,
  `CREATE INDEX IF NOT EXISTS "LibraryItems_libraryId_updatedAtIndex" ON "LibraryItems" ("libraryId", "updatedAt")`,
  // Matches scripts/run-enable-rls.ts, which enables RLS on every table it
  // discovers. Doing it here too means a fresh apply leaves no window where the
  // tables exist unprotected.
  `ALTER TABLE "ResourceLibraries" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "LibraryItems" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddResourceLibrarySchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[library:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_RESOURCE_LIBRARY_DDL) console.log(`${statement};`);
    console.log('[library:schema] review, then re-run with --apply');
    return;
  }

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
      for (const statement of ADDITIVE_RESOURCE_LIBRARY_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[library:schema] applied ${ADDITIVE_RESOURCE_LIBRARY_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddResourceLibrarySchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[library:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
