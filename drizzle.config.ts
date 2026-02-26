/**
 * Drizzle Kit config for Turso (push / introspect).
 * Uses same env vars as the app: ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN.
 */
import { defineConfig } from 'drizzle-kit';

const url = process.env.ASTRO_DB_REMOTE_URL;
const authToken = process.env.ASTRO_DB_APP_TOKEN;

if (!url || !authToken) {
  throw new Error('ASTRO_DB_REMOTE_URL and ASTRO_DB_APP_TOKEN must be set (e.g. in .env)');
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
