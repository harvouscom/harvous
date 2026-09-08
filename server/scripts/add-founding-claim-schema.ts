/**
 * Records who claimed the founding offer. Dry-run by default; `--apply` executes.
 *
 * Founding stopped being a Polar product at 3.0 and became a `duration: once`
 * discount on the annual plan, so the subscription a founder ends up holding is
 * indistinguishable from any other annual one. "Is this person a founder" can no
 * longer be read from `Entitlements.productId`, and it has to survive the
 * renewal that puts them on the list price — so it is stamped here, once, when
 * the discounted checkout completes.
 *
 * A timestamp rather than a boolean: it answers *when*, `NULL` means never, and
 * `COUNT(*) WHERE NOT NULL` is the claim count that drives "N spots left".
 * Deliberately not in `Entitlements` — that table is capabilities, and founding
 * grants none that a normal Plus subscription doesn't.
 *
 * Why this rather than `db:push`: push diffs the *whole* schema against the
 * target, and on a database carrying tables from another in-flight branch that
 * diff offers to drop them. This adds one nullable column.
 *
 * `ADD COLUMN IF NOT EXISTS` is idempotent, so re-running is safe.
 *
 * **Apply this before the branch's server starts, not after.** Drizzle selects
 * every column it knows about, so `getCachedUserData` starts asking for
 * `foundingClaimedAt` the moment the schema declares it — and against a database
 * that doesn't have the column yet, that 500s `/api/navigation/data` and
 * `/api/user/get-profile`, which have nothing to do with billing. The billing
 * reads fail soft (`countFoundingClaims` returns FOUNDING_CAP, so the founding
 * offer simply reads as sold out); the full-row reads do not.
 *
 *   npm run founding:schema         # print the DDL, touch nothing
 *   npm run founding:schema:apply   # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const FOUNDING_CLAIM_DDL = [
  `ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "foundingClaimedAt" timestamp`,
  // Partial on purpose. The only query is `count(*) WHERE foundingClaimedAt IS
  // NOT NULL`, and a plain btree over a column that is NULL for every user but
  // at most 99 would not be used for it — Postgres would seq-scan anyway. The
  // partial index holds only the claim rows, so it stays tiny, it is actually
  // chosen for that count, and it builds instantly on a table where nothing has
  // claimed yet (which matters: this is not CONCURRENTLY, so it takes a SHARE
  // lock on UserMetadata while it builds).
  `CREATE INDEX IF NOT EXISTS "UserMetadata_foundingClaimedAtIndex" ON "UserMetadata" ("foundingClaimedAt") WHERE "foundingClaimedAt" IS NOT NULL`,
] as const;

export async function runAddFoundingClaimSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[founding:schema] DRY RUN; no database connection opened');
    for (const statement of FOUNDING_CLAIM_DDL) console.log(`${statement};`);
    console.log('[founding:schema] review, then re-run with --apply');
    return;
  }
  // Only past the dry run: printing the DDL connects to nothing.
  requireDbTarget({ scriptName: 'founding:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  // max: 1 — the shared dev pooler caps session-mode clients, and a migration
  // has no reason to hold more than one.
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of FOUNDING_CLAIM_DDL) await tx.unsafe(statement);
    });
    console.log(`[founding:schema] applied ${FOUNDING_CLAIM_DDL.length} idempotent statements`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddFoundingClaimSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[founding:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
