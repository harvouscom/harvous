/**
 * Turso database client via @libsql/client + Drizzle ORM.
 *
 * In the Netlify build, --alias:@libsql/client=@libsql/client/web redirects
 * this import to the HTTP-only client (no native @libsql/linux-x64-gnu).
 * Same env vars (ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN).
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

function createDb() {
  const url = process.env.ASTRO_DB_REMOTE_URL;
  const authToken = process.env.ASTRO_DB_APP_TOKEN;

  if (!url) {
    throw new Error('Missing ASTRO_DB_REMOTE_URL environment variable');
  }
  if (!authToken) {
    throw new Error('Missing ASTRO_DB_APP_TOKEN environment variable');
  }

  const tursoClient = createClient({ url, authToken });
  return drizzle(tursoClient, { schema });
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
