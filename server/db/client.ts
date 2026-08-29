/**
 * Supabase Postgres database client via postgres.js + Drizzle ORM.
 *
 * Env: SUPABASE_DATABASE_URL (pooler, port 6543).
 * For migrations/drizzle-kit: SUPABASE_DIRECT_URL (port 5432).
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

function createDb() {
  // Prefer the pooler URL (port 6543) for runtime queries.
  // SUPABASE_DIRECT_URL (port 5432) is for drizzle-kit migrations only.
  const url = process.env.SUPABASE_DATABASE_URL ?? process.env.SUPABASE_DIRECT_URL;
  if (!url) throw new Error('Missing SUPABASE_DIRECT_URL or SUPABASE_DATABASE_URL environment variable');

  /*
   * `DB_POOL_MAX` exists for the case where more than one API is pointed at the same
   * database — two worktrees running `dev:all` side by side, most often. Supabase's session
   * pooler caps the *project* at 15 clients, so two servers each asking for 10 exhaust it
   * between them and every query starts failing with EMAXCONNSESSION.
   *
   * The failure does not look like a connection problem from the browser. The app renders
   * signed in and completely empty: `/api/navigation/data` is among the first requests to
   * lose its turn, and a browser with no cached space id has nothing to fall back on — so
   * the space tile drops to its layers fallback, the greeting has no counts, and Activity
   * says "nothing recorded on this day" while the network tab shows a 500 that a retry
   * quietly turns into a 200. Two people on the same localhost can disagree about whether
   * it works, depending on which of them has a warm cache.
   *
   * Default unchanged at 10, so a single server behaves exactly as before.
   */
  const poolMax = Number(process.env.DB_POOL_MAX) || 10;

  const client = postgres(url, {
    max: poolMax,
    idle_timeout: 300,
    connect_timeout: 30,
  });
  return drizzle(client, { schema });
}

// Lazy singleton — created on first access so env vars can be loaded first
let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// Convenience export for direct usage: `import { db } from './client'`
// Uses a proxy to defer creation until first property access
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});

/** First real query pays TCP+TLS to Supabase; dedupe parallel warmups within one invocation. */
let warmPostgresPromise: Promise<void> | null = null;

/**
 * Establishes the postgres.js pool connection (SELECT 1). Safe to call multiple times;
 * concurrent callers share one attempt. Failures are logged; callers may still retry via normal queries.
 */
export function warmPostgresConnection(): Promise<void> {
  if (!warmPostgresPromise) {
    warmPostgresPromise = (async () => {
      try {
        await getDb().execute(sql`select 1`);
      } catch (e) {
        console.warn('[db] warmPostgresConnection:', e instanceof Error ? e.message : e);
      }
    })();
  }
  return warmPostgresPromise;
}
