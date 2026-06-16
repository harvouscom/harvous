/**
 * Enable RLS on every public app table — discovered dynamically.
 *
 * Runs automatically after `npm run db:push` (see package.json), so any table
 * created by `drizzle-kit push` is protected without needing to maintain a list.
 *
 * Usage (from repo root, with Supabase credentials in .env):
 *   npx tsx scripts/run-enable-rls.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

/** All public base tables and whether RLS is currently enabled. */
const publicTablesQuery = (sql: postgres.Sql) => sql<
  { table_name: string; rls_enabled: boolean }[]
>`
  SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relname LIKE 'pg_%'
  ORDER BY c.relname
`;

async function main() {
  const url = process.env.SUPABASE_DIRECT_URL ?? process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error('Missing SUPABASE_DIRECT_URL or SUPABASE_DATABASE_URL');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, connect_timeout: 30 });
  try {
    const tables = await publicTablesQuery(sql);
    const needsRls = tables.filter((t) => !t.rls_enabled);

    if (needsRls.length === 0) {
      console.log(`All ${tables.length} public tables already have RLS enabled.`);
      return;
    }

    for (const { table_name } of needsRls) {
      // Identifier is quoted because table names are mixed-case. ENABLE on a
      // table that already has RLS is a no-op, so this is idempotent.
      await sql.unsafe(`ALTER TABLE "${table_name}" ENABLE ROW LEVEL SECURITY;`);
      console.log('Enabled RLS:', table_name);
    }

    const after = await publicTablesQuery(sql);
    const disabled = after.filter((t) => !t.rls_enabled);
    console.log('Tables checked:', after.length);
    console.log('RLS enabled this run:', needsRls.length);
    console.log('RLS still disabled:', disabled.length);
    if (disabled.length) {
      console.error('Still disabled:', disabled.map((t) => t.table_name).join(', '));
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
