/**
 * Additive verse-stickers stage. Dry-run by default; `--apply` executes.
 *
 * What it is for: stickers beside a verse in the Harvous Bible reader (`VerseStickers`, see
 * server/db/schema.ts), and the child notebook move, which converts a child's
 * `FamilyChildVerseStickers` into these rows when the notebook moves into a teen's own account.
 *
 * Why this rather than `db:push`: push diffs the whole schema against the target, and on a
 * database carrying tables from another in-flight branch that diff offers to drop them. This
 * script only ever adds. Every statement is idempotent (IF NOT EXISTS), so re-running is a
 * no-op, and the set runs in one transaction.
 *
 * Until it runs, the reader shows no stickers and refuses to save one (the routes treat the
 * missing table as "none"), and a notebook move leaves the child's stickers behind instead of
 * failing. Apply it before the notebook move ships.
 *
 *   npm run verse-stickers:schema         # print the DDL, touch nothing
 *   npm run verse-stickers:schema:apply   # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_VERSE_STICKERS_DDL = [
  `CREATE TABLE IF NOT EXISTS "VerseStickers" (
    "userId" text NOT NULL, "book" text NOT NULL, "chapter" integer NOT NULL, "verse" integer NOT NULL,
    "sticker" text NOT NULL, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
    PRIMARY KEY ("userId", "book", "chapter", "verse")
  )`,
  // The API reaches it with the service role, as every other table; nothing reads it with the anon key.
  `ALTER TABLE "VerseStickers" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddVerseStickersSchema(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  if (!argv.includes('--apply')) {
    console.log('[verse-stickers:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_VERSE_STICKERS_DDL) console.log(`${statement};`);
    console.log('[verse-stickers:schema] review, then re-run with --apply');
    return;
  }
  // Only past the dry run: printing the DDL connects to nothing.
  requireDbTarget({ scriptName: 'verse-stickers:schema', writes: true, argv, env });
  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_VERSE_STICKERS_DDL) await tx.unsafe(statement);
    });
    console.log(`[verse-stickers:schema] applied ${ADDITIVE_VERSE_STICKERS_DDL.length} idempotent statements`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddVerseStickersSchema(process.argv.slice(2), process.env).catch((error) => {
    // The reason, never the connection string.
    const reason = String(error instanceof Error ? error.message : error).replace(/postgres(ql)?:\/\/\S+/gi, '[database url]');
    console.error('[verse-stickers:schema] failed:', reason);
    process.exitCode = 1;
  });
}
