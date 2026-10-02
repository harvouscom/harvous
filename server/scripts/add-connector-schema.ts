/**
 * Additive Connector schema stage. Dry-run by default; `--apply` executes.
 *
 * Two new tables for the read-only MCP server (server/connector/): `ConnectorClients`
 * (which AI apps a person has connected, and Harvous's own Disconnect) and
 * `ConnectorUsageDays` (the daily call cap). Same reasoning as `review:schema`:
 * `drizzle-kit push` diffs the whole schema and, on a dev database shared by several
 * worktrees, offers to drop other branches' tables. This only ever adds.
 *
 * Every statement is idempotent, so re-running is a no-op; the set runs in one transaction.
 *
 *   npm run connector:schema           # print the DDL, touch nothing
 *   npm run connector:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_CONNECTOR_DDL = [
  `CREATE TABLE IF NOT EXISTS "ConnectorClients" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "clientId" text NOT NULL,
    "clientName" text,
    "firstUsedAt" timestamptz NOT NULL,
    "lastUsedAt" timestamptz NOT NULL,
    "revokedAt" timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ConnectorClients_userId_clientIdUnique" ON "ConnectorClients" ("userId", "clientId")`,
  `CREATE TABLE IF NOT EXISTS "ConnectorUsageDays" (
    "userId" text NOT NULL,
    "day" text NOT NULL,
    "toolCalls" integer NOT NULL DEFAULT 0,
    "updatedAt" timestamptz NOT NULL,
    CONSTRAINT "ConnectorUsageDays_userId_day_pk" PRIMARY KEY ("userId", "day")
  )`,
  // Personal tokens, for apps that take a fixed token instead of a sign-in (Grok Bot).
  // Only a hash is stored; the token itself is shown once, at creation.
  `CREATE TABLE IF NOT EXISTS "ConnectorApiKeys" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "keyHash" text NOT NULL,
    "keyPrefix" text NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "lastUsedAt" timestamptz,
    "revokedAt" timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ConnectorApiKeys_keyHashUnique" ON "ConnectorApiKeys" ("keyHash")`,
  // At most one active token per person, enforced by the database, not just the route.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ConnectorApiKeys_activePerUser" ON "ConnectorApiKeys" ("userId") WHERE "revokedAt" IS NULL`,
  `ALTER TABLE "ConnectorApiKeys" ENABLE ROW LEVEL SECURITY`,
  // Supabase exposes every public table to PostgREST; the API reads these through the
  // service connection, never through anon/authenticated roles.
  `ALTER TABLE "ConnectorClients" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "ConnectorUsageDays" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddConnectorSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[connector:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_CONNECTOR_DDL) console.log(`${statement};`);
    console.log('[connector:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'connector:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_CONNECTOR_DDL) await tx.unsafe(statement);
    });
    console.log(`[connector:schema] applied ${ADDITIVE_CONNECTOR_DDL.length} idempotent statements`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddConnectorSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[connector:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
