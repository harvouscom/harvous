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

  const client = postgres(url, {
    max: 10,
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
