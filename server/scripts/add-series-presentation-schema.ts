/**
 * Additive schema stage for series presentation and staff sermon drafts.
 * Dry-run by default; `--apply` executes.
 *
 * Three columns, all nullable, all additive:
 *   ChurchSeries.color        — a THREAD_COLORS token, so a run reads as one run
 *   ChurchSeries.description  — one staff-facing line on what the run is about
 *   Notes.plannedForServiceId — the staff side of the sermon (see the schema docblock)
 *
 * Why this rather than relying on `db:push`: `drizzle-kit push` diffs the *whole*
 * schema against the target, so on a database carrying tables from another
 * in-flight branch that diff offers to drop them. This script only ever adds, so
 * it is safe against a shared dev database, and it is what recreates the columns
 * on a fresh machine. Same reasoning and same shape as
 * add-resource-library-schema.ts.
 *
 * Every statement is idempotent (IF NOT EXISTS), so re-running is a no-op, and
 * the whole set runs in one transaction.
 *
 *   npm run series:schema           # print the DDL, touch nothing
 *   npm run series:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';

export const ADDITIVE_SERIES_PRESENTATION_DDL = [
  // Nullable with no default on purpose: null means "derive it", and
  // `seriesAccent` turns the row id into a stable colour. A DEFAULT here would
  // have made every existing series the same colour, which is the one outcome
  // this feature exists to avoid.
  `ALTER TABLE "ChurchSeries" ADD COLUMN IF NOT EXISTS "color" text`,
  `ALTER TABLE "ChurchSeries" ADD COLUMN IF NOT EXISTS "description" text`,
  // The staff half of the sermon link. Read only ever scoped to the viewer's own
  // userId — see the column docblock in server/db/schema.ts and the grep
  // contract test in server/routes/__tests__/church-services-routes.test.ts.
  `ALTER TABLE "Notes" ADD COLUMN IF NOT EXISTS "plannedForServiceId" text`,
  // Leads with userId because that is how the column is always queried. Indexing
  // the service id alone would make the cross-author lookup cheap, and that is
  // the query this schema deliberately does not want to serve.
  `CREATE INDEX IF NOT EXISTS "Notes_userId_plannedForServiceIdIndex" ON "Notes" ("userId", "plannedForServiceId")`,
] as const;

export async function runAddSeriesPresentationSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[series:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_SERIES_PRESENTATION_DDL) console.log(`${statement};`);
    console.log('[series:schema] review, then re-run with --apply');
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
      for (const statement of ADDITIVE_SERIES_PRESENTATION_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[series:schema] applied ${ADDITIVE_SERIES_PRESENTATION_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddSeriesPresentationSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[series:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
