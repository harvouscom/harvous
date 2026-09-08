/**
 * Additive schema stage for the Discover catalog. Dry-run by default;
 * `--apply` executes.
 *
 * Same shape and same reason as add-space-study-suggestions-schema.ts:
 * `drizzle-kit push` diffs the whole schema and, on a dev database carrying
 * another branch's tables, offers to drop them. This only ever adds, so it is
 * safe against a shared database mid-flight, and it is what recreates the
 * tables on a fresh machine.
 *
 * Every statement is idempotent (IF NOT EXISTS), and the set runs in one
 * transaction. Note there is no ALTER TABLE here at all — Discover adds two
 * tables and touches nothing that already holds data.
 *
 *   npm run discover:schema           # print the DDL, touch nothing
 *   npm run discover:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_DISCOVER_LISTINGS_DDL = [
  // Attributed on purpose — see the docblock on the table in schema.ts. The
  // byline is snapshotted at submit and never re-resolved.
  `CREATE TABLE IF NOT EXISTS "DiscoverListings" (
    "id" text PRIMARY KEY,
    "kind" text NOT NULL,
    "sourceId" text NOT NULL,
    "sourceVersionId" text,
    "submittedByUserId" text NOT NULL,
    "authorDisplayName" text,
    "title" text NOT NULL,
    "description" text,
    "category" text,
    "slug" text,
    "payload" text NOT NULL,
    "preview" text,
    "status" text NOT NULL DEFAULT 'submitted',
    "installCount" integer NOT NULL DEFAULT 0,
    "listedAt" timestamptz,
    "reviewedByUserId" text,
    "reviewedAt" timestamptz,
    "reviewNote" text,
    "staffReadAt" timestamptz,
    "supersedesListingId" text,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "DiscoverListings_status_listedAtIndex" ON "DiscoverListings" ("status", "listedAt")`,
  `CREATE INDEX IF NOT EXISTS "DiscoverListings_status_createdAtIndex" ON "DiscoverListings" ("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "DiscoverListings_submittedBy_createdAtIndex" ON "DiscoverListings" ("submittedByUserId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "DiscoverListings_status_category_listedAtIndex" ON "DiscoverListings" ("status", "category", "listedAt")`,
  // Partial: only a listed row owns a slug. Pending rows carry NULL and cannot
  // collide, and a declined submission frees its slug again.
  `CREATE UNIQUE INDEX IF NOT EXISTS "DiscoverListings_slug_unique" ON "DiscoverListings" ("slug") WHERE "slug" IS NOT NULL`,
  // The idempotency key. The unique index is not an optimization — the install
  // transaction inserts here first and lets a violation mean "already yours".
  `CREATE TABLE IF NOT EXISTS "DiscoverInstalls" (
    "id" text PRIMARY KEY,
    "listingId" text NOT NULL,
    "userId" text NOT NULL,
    "createdRefId" text NOT NULL,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DiscoverInstalls_listing_user_unique" ON "DiscoverInstalls" ("listingId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "DiscoverInstalls_userId_createdAtIndex" ON "DiscoverInstalls" ("userId", "createdAt")`,
  // Matches scripts/run-enable-rls.ts, so a fresh apply leaves no window where
  // the tables exist unprotected.
  `ALTER TABLE "DiscoverListings" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "DiscoverInstalls" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddDiscoverListingsSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[discover:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_DISCOVER_LISTINGS_DDL) console.log(`${statement};`);
    console.log('[discover:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'discover:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_DISCOVER_LISTINGS_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[discover:schema] applied ${ADDITIVE_DISCOVER_LISTINGS_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddDiscoverListingsSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[discover:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
