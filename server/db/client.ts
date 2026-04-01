/**
 * Supabase Postgres database client via postgres.js + Drizzle ORM.
 *
 * Env: SUPABASE_DATABASE_URL (pooler, port 6543).
 * For migrations/drizzle-kit: SUPABASE_DIRECT_URL (port 5432).
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
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
