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
import { requireDbTarget } from '../utils/require-db-target';

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
  // ── Church lane (v0.1) ────────────────────────────────────────────────────
  //
  // Who an item is for, inside a church. Separate rows rather than columns on
  // LibraryItems because one item is legitimately in several places at once —
  // a commentary that belongs to the whole church *and* is surfaced in Youth.
  // A column would have forced a copy per placement, and a copied item is two
  // things to archive.
  `CREATE TABLE IF NOT EXISTS "LibraryItemScopes" (
    "id" text PRIMARY KEY,
    "libraryItemId" text NOT NULL,
    "scopeKind" text NOT NULL,
    "spaceId" text,
    "ministryKey" text,
    "createdAt" timestamptz NOT NULL
  )`,
  // Partial uniques per kind: NULLs are distinct in a plain unique, so one
  // index over (itemId, spaceId, ministryKey) would let an item be scoped to
  // the whole org twice. Same shape as ChurchSeries' per-scope uniques.
  `CREATE UNIQUE INDEX IF NOT EXISTS "LibraryItemScopes_org_unique" ON "LibraryItemScopes" ("libraryItemId") WHERE "scopeKind" = 'org'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LibraryItemScopes_space_unique" ON "LibraryItemScopes" ("libraryItemId", "spaceId") WHERE "scopeKind" = 'space'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LibraryItemScopes_ministry_unique" ON "LibraryItemScopes" ("libraryItemId", "ministryKey") WHERE "scopeKind" = 'ministry'`,
  `CREATE INDEX IF NOT EXISTS "LibraryItemScopes_libraryItemIdIndex" ON "LibraryItemScopes" ("libraryItemId")`,
  `CREATE INDEX IF NOT EXISTS "LibraryItemScopes_spaceIdIndex" ON "LibraryItemScopes" ("spaceId")`,
  // What a space's leader chose to surface, and in what order. `pinned = false`
  // is not a deleted row: it is a leader saying "not this one, not here",
  // which has to outrank an org-wide default without editing the org's item.
  `CREATE TABLE IF NOT EXISTS "LibraryItemSpacePins" (
    "id" text PRIMARY KEY,
    "spaceId" text NOT NULL,
    "libraryItemId" text NOT NULL,
    "pinned" boolean NOT NULL DEFAULT true,
    "sortOrder" integer NOT NULL DEFAULT 0,
    "pinnedByUserId" text NOT NULL,
    "pinnedAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LibraryItemSpacePins_space_item_unique" ON "LibraryItemSpacePins" ("spaceId", "libraryItemId")`,
  `CREATE INDEX IF NOT EXISTS "LibraryItemSpacePins_spaceIdIndex" ON "LibraryItemSpacePins" ("spaceId")`,
  // Congregant-submitted suggestions awaiting staff review. Shaped after
  // SupportTickets — submit, queue, triage — because that is the one review
  // flow this codebase already has and it earned its shape.
  `CREATE TABLE IF NOT EXISTS "LibraryItemSuggestions" (
    "id" text PRIMARY KEY,
    "churchId" text NOT NULL,
    "suggestedByUserId" text NOT NULL,
    "url" text NOT NULL,
    "title" text,
    "note" text,
    "status" text NOT NULL DEFAULT 'open',
    "reviewedByUserId" text,
    "reviewedAt" timestamptz,
    "createdItemId" text,
    "staffReadAt" timestamptz,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "LibraryItemSuggestions_church_status_createdAtIndex" ON "LibraryItemSuggestions" ("churchId", "status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "LibraryItemSuggestions_suggestedBy_createdAtIndex" ON "LibraryItemSuggestions" ("suggestedByUserId", "createdAt")`,
  // Which library items a planned sermon or entry draws on. A join table, not
  // a column: docs/future/CHURCH_STUDY_MATERIAL_LINKING.md is the post-mortem
  // of the single pointer that was tried and removed, and it says outright not
  // to add a cheaper one. Staff-side prep, distinct from the congregant-facing
  // "material claims the service" inversion, which is still unbuilt.
  `CREATE TABLE IF NOT EXISTS "ChurchServiceLibraryItems" (
    "id" text PRIMARY KEY,
    "serviceId" text NOT NULL,
    "libraryItemId" text NOT NULL,
    "attachedByUserId" text NOT NULL,
    "sortOrder" integer NOT NULL DEFAULT 0,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchServiceLibraryItems_service_item_unique" ON "ChurchServiceLibraryItems" ("serviceId", "libraryItemId")`,
  `CREATE INDEX IF NOT EXISTS "ChurchServiceLibraryItems_serviceIdIndex" ON "ChurchServiceLibraryItems" ("serviceId")`,
  // The reverse question — "which weeks used this?" — is worth an index now
  // rather than after someone writes the query as a table scan.
  `CREATE INDEX IF NOT EXISTS "ChurchServiceLibraryItems_libraryItemIdIndex" ON "ChurchServiceLibraryItems" ("libraryItemId")`,
  // Matches scripts/run-enable-rls.ts, which enables RLS on every table it
  // discovers. Doing it here too means a fresh apply leaves no window where the
  // tables exist unprotected.
  `ALTER TABLE "ResourceLibraries" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "LibraryItems" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "LibraryItemScopes" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "LibraryItemSpacePins" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "LibraryItemSuggestions" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "ChurchServiceLibraryItems" ENABLE ROW LEVEL SECURITY`,
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
  // Only past the dry run: printing the DDL connects to nothing.
  requireDbTarget({ scriptName: 'library:schema', writes: true, argv, env });

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
