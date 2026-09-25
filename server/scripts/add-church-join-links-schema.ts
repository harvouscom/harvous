/**
 * Additive schema stage for church join links. Dry-run by default; `--apply`
 * executes.
 *
 * Same shape and same reason as add-space-study-suggestions-schema.ts:
 * `drizzle-kit push` diffs the whole schema and, on a dev database carrying
 * another branch's tables, offers to drop them. This only ever adds.
 *
 * Apply it to production **before** the routes that read the table ship —
 * those routes 500 without it. Nothing else reads it, which is why this is a
 * table and not a `Churches` column (see the docblock in schema.ts).
 *
 * Every statement is idempotent (IF NOT EXISTS), and the set runs in one
 * transaction.
 *
 *   npm run church-join:schema           # print the DDL, touch nothing
 *   npm run church-join:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_CHURCH_JOIN_LINKS_DDL = [
  `CREATE TABLE IF NOT EXISTS "ChurchJoinLinks" (
    "id" text PRIMARY KEY,
    "churchId" text NOT NULL,
    "token" text NOT NULL,
    "createdBy" text NOT NULL,
    "useCount" integer NOT NULL DEFAULT 0,
    "revokedAt" timestamptz,
    "revokedReason" text,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchJoinLinks_token_unique" ON "ChurchJoinLinks" ("token")`,
  // One live link per church. Rotate = revoke + insert in one transaction.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ChurchJoinLinks_church_live_unique" ON "ChurchJoinLinks" ("churchId") WHERE "revokedAt" IS NULL`,
  // Matches scripts/run-enable-rls.ts, so a fresh apply leaves no window where
  // the table exists unprotected.
  `ALTER TABLE "ChurchJoinLinks" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddChurchJoinLinksSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[church-join:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_CHURCH_JOIN_LINKS_DDL) console.log(`${statement};`);
    console.log('[church-join:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'church-join:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_CHURCH_JOIN_LINKS_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[church-join:schema] applied ${ADDITIVE_CHURCH_JOIN_LINKS_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddChurchJoinLinksSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[church-join:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
