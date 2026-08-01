/**
 * Apply supabase/realtime-authorization.sql (private Broadcast/Presence RLS).
 *
 * Usage (from repo root, with Supabase credentials in .env):
 *   npx tsx scripts/run-realtime-authorization.ts
 *
 * See docs/SUPABASE_REALTIME_SETUP.md for the full rollout order — this is step 1.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';

async function main() {
  const url = process.env.SUPABASE_DIRECT_URL ?? process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error('Missing SUPABASE_DIRECT_URL or SUPABASE_DATABASE_URL');
    process.exit(1);
  }

  const sqlPath = join(process.cwd(), 'supabase/realtime-authorization.sql');
  const body = readFileSync(sqlPath, 'utf8');
  const sql = postgres(url, { max: 1, connect_timeout: 30 });

  try {
    await sql.unsafe(body);
    const policies = await sql<{ polname: string }[]>`
      SELECT pol.polname
      FROM pg_policy pol
      WHERE pol.polrelid = 'realtime.messages'::regclass
      ORDER BY pol.polname
    `;
    const fn = await sql<{ proname: string }[]>`
      SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'harvous_realtime_topic_allowed'
    `;
    console.log('Applied', sqlPath);
    console.log(
      'realtime.messages policies:',
      policies.map((p) => p.polname).join(', ') || '(none)',
    );
    console.log(
      'helper function:',
      fn.map((f) => f.proname).join(', ') || 'MISSING',
    );
    if (!fn.length || !policies.some((p) => p.polname.startsWith('harvous_'))) {
      console.error('Realtime authorization objects missing after apply.');
      process.exit(1);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  if (/must be owner of table messages|permission denied for (schema|table) realtime/i.test(message)) {
    console.error(`
Could not modify realtime.messages from this connection.
Do not ALTER the table (owned by supabase_realtime_admin). The SQL file only
creates a helper + policies — if this still fails, paste
  supabase/realtime-authorization.sql
into the Supabase Dashboard → SQL Editor and run it there.
See docs/SUPABASE_REALTIME_SETUP.md.
`);
  }
  process.exit(1);
});
