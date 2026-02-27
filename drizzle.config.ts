/**
 * Drizzle Kit config for Turso (push / introspect).
 * Env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (fallback: ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN).
 */
import { defineConfig } from 'drizzle-kit';

const url = process.env.TURSO_DATABASE_URL ?? process.env.ASTRO_DB_REMOTE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.ASTRO_DB_APP_TOKEN;

if (!url || !authToken) {
  throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (or ASTRO_DB_*) must be set (e.g. in .env)');
}

export default defineConfig({
  dialect: 'turso',
  schema: './server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url,
    authToken,
  },
});
