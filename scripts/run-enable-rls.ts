/**
 * Enable RLS on all public app tables (see scripts/enable-rls.sql).
 *
 * Usage (from repo root, with Supabase credentials in .env):
 *   npx tsx scripts/run-enable-rls.ts
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

async function main() {
  const url = process.env.SUPABASE_DIRECT_URL ?? process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error('Missing SUPABASE_DIRECT_URL or SUPABASE_DATABASE_URL');
    process.exit(1);
  }

  const sqlText = readFileSync('scripts/enable-rls.sql', 'utf8');
  const statements = sqlText
    .split(';')
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);

  const sql = postgres(url, { max: 1, connect_timeout: 30 });
  try {
    for (const statement of statements) {
      await sql.unsafe(`${statement};`);
      const table = statement.match(/"([^"]+)"/)?.[1];
      console.log('OK:', table ?? statement.slice(0, 60));
    }

    const rows = await sql`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND NOT c.relname LIKE 'pg_%'
      ORDER BY c.relname
    `;

    const disabled = rows.filter((r) => !r.rls_enabled);
    console.log('Tables checked:', rows.length);
    console.log('RLS disabled:', disabled.length);
    if (disabled.length) {
      console.error('Still disabled:', disabled.map((r) => r.table_name).join(', '));
      process.exit(1);
    }
    console.log('All public tables have RLS enabled.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
