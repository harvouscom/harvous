/**
 * Lets a plan exist without a church. Dry-run by default; `--apply` executes.
 *
 * A group that meets without a church still meets on a rhythm, so
 * `ChurchServices.churchId` and `ChurchSeries.churchId` stop being required.
 * The invariant `churchId IS NULL ⇒ spaceId IS NOT NULL` is enforced in the
 * write routes, not here — see the column docblocks in `server/db/schema.ts`.
 *
 * Why this rather than `db:push`: push diffs the *whole* schema against the
 * target, and on a database carrying tables from another in-flight branch that
 * diff offers to drop them. This only relaxes two constraints.
 *
 * `DROP NOT NULL` is naturally idempotent — dropping a constraint that is
 * already gone is a no-op in Postgres, not an error — so re-running is safe and
 * the whole set runs in one transaction.
 *
 * This one widens rather than adds, so it is not reversible by re-running the
 * opposite: restoring NOT NULL would fail against any churchless row already
 * written. That is the intended one-way door.
 *
 *   npm run space-plans:schema         # print the DDL, touch nothing
 *   npm run space-plans:schema:apply   # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const SPACE_OWNED_PLANS_DDL = [
  `ALTER TABLE "ChurchServices" ALTER COLUMN "churchId" DROP NOT NULL`,
  `ALTER TABLE "ChurchSeries" ALTER COLUMN "churchId" DROP NOT NULL`,
] as const;

export async function runAddSpaceOwnedPlansSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[space-plans:schema] DRY RUN; no database connection opened');
    for (const statement of SPACE_OWNED_PLANS_DDL) console.log(`${statement};`);
    console.log('[space-plans:schema] review, then re-run with --apply');
    return;
  }
  // Only past the dry run: printing the DDL connects to nothing.
  requireDbTarget({ scriptName: 'owned-plans:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  // max: 1 — the shared dev pooler caps session-mode clients, and a migration
  // has no reason to hold more than one.
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of SPACE_OWNED_PLANS_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[space-plans:schema] applied ${SPACE_OWNED_PLANS_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddSpaceOwnedPlansSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[space-plans:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
