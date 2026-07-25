/**
 * Local development server for the Hono API.
 *
 * Runs on port 3001 alongside the Astro dev server (4321)
 * and the SPA Vite dev server (4322).
 *
 * Usage: npx tsx watch server/dev.ts
 *
 * Requires .env to be loaded (SUPABASE_DATABASE_URL, CLERK_SECRET_KEY).
 *
 * Optional: DEV_RESET_USER_ID — Clerk user ID to reset on startup so each dev run
 * starts with an empty account (like a new user). Set in .env for a clean slate every time.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env BEFORE importing the app. ESM hoists static imports above this
// call, so app + routes are pulled in via dynamic import after dotenv runs.
config({ path: resolve(import.meta.dirname || __dirname, '..', '.env') });

const port = parseInt(process.env.API_PORT || '3001', 10);

async function main() {
  const { serve } = await import('@hono/node-server');
  const { default: app } = await import('./app');
  const { warmPostgresConnection } = await import('./db/client');
  const { resetUserToNew } = await import('./utils/reset-user-to-new');

  if (process.env.NODE_ENV !== 'production' && process.env.DEV_RESET_USER_ID) {
    try {
      await resetUserToNew(process.env.DEV_RESET_USER_ID);
      console.log(`Dev reset user ${process.env.DEV_RESET_USER_ID} to new-user state.`);
    } catch (err) {
      console.error('Dev reset on startup failed (server will still start):', err);
    }
  }

  await warmPostgresConnection();

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Hono API running on http://localhost:${port}`);
  });
}

main();
