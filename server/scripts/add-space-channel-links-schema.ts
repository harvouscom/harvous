/**
 * Additive space↔channel pairing stage. Dry-run by default; `--apply` executes.
 *
 * Why this rather than `db:push`: push diffs the *whole* schema against the
 * target, and on a database carrying tables from another in-flight branch that
 * diff offers to drop them. This script only ever adds, so it is safe against a
 * shared dev database — and it is what recreates the table on a fresh machine.
 *
 * Every statement is idempotent (IF NOT EXISTS), so re-running is a no-op, and
 * the whole set runs in one transaction.
 *
 *   npm run channel-links:schema         # print the DDL, touch nothing
 *   npm run channel-links:schema:apply   # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';

export const ADDITIVE_SPACE_CHANNEL_LINKS_DDL = [
  `CREATE TABLE IF NOT EXISTS "ChurchSpaceChannelLinks" (
    "id" text PRIMARY KEY,
    "orgId" text NOT NULL,
    "spaceId" text NOT NULL,
    "channelSpaceId" text NOT NULL,
    "createdByUserId" text NOT NULL,
    "createdAt" timestamptz NOT NULL
  )`,
  // A room broadcasts through one channel or none. Also the guard the set
  // route's upsert targets, so two staff pairing the same room at once
  // converge on one row instead of forking two.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchSpaceChannelLinks_space_unique" ON "ChurchSpaceChannelLinks" ("spaceId")`,
  // The reverse read — "what is this channel the companion of?" — which the
  // channel's own header asks on every open.
  `CREATE INDEX IF NOT EXISTS "ChurchSpaceChannelLinks_channelSpaceIdIndex" ON "ChurchSpaceChannelLinks" ("channelSpaceId")`,
  `CREATE INDEX IF NOT EXISTS "ChurchSpaceChannelLinks_orgIdIndex" ON "ChurchSpaceChannelLinks" ("orgId")`,
  // Matches every other church table: reads go through the service role, so
  // RLS on with no policies is "nothing reaches this from a client key".
  `ALTER TABLE "ChurchSpaceChannelLinks" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddSpaceChannelLinksSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[channel-links:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_SPACE_CHANNEL_LINKS_DDL) console.log(`${statement};`);
    console.log('[channel-links:schema] review, then re-run with --apply');
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
      for (const statement of ADDITIVE_SPACE_CHANNEL_LINKS_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[channel-links:schema] applied ${ADDITIVE_SPACE_CHANNEL_LINKS_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddSpaceChannelLinksSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error(
      '[channel-links:schema] failed:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
