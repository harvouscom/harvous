/**
 * Apply a hand-written SQL file from `server/db/manual/`.
 *
 * `npm run db:push` reconciles the whole schema, which makes it the wrong tool
 * when a branch is cut from main and another branch's columns are already live
 * — push proposes dropping them. The manual files are additive and can land on
 * their own; this runs one.
 *
 * Usage (from repo root, with Supabase credentials in .env):
 *   npx tsx scripts/run-sql-file.ts server/db/manual/<file>.sql
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/run-sql-file.ts <path-to.sql>');
    process.exit(1);
  }

  const url = process.env.SUPABASE_DIRECT_URL ?? process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error('Missing SUPABASE_DIRECT_URL or SUPABASE_DATABASE_URL');
    process.exit(1);
  }

  const statements = readFileSync(file, 'utf8');
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql.unsafe(statements);
    console.log(`Applied ${file}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
