/**
 * Drizzle Kit config for Supabase Postgres (push / introspect).
 * Env: SUPABASE_DIRECT_URL (direct connection, port 5432).
 */
import { defineConfig } from 'drizzle-kit';

const url = process.env.SUPABASE_DIRECT_URL;

if (!url) {
  throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env)');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url,
  },
});
