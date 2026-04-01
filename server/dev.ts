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
 * shows only onboarding (like a new user). Set in .env for a clean slate every time.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(import.meta.dirname || __dirname, '..', '.env') });

import { serve } from '@hono/node-server';
import app from './app';
import { resetUserToNew } from './utils/reset-user-to-new';

const port = parseInt(process.env.API_PORT || '3001', 10);

async function main() {
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_RESET_USER_ID) {
    try {
      await resetUserToNew(process.env.DEV_RESET_USER_ID);
      console.log(`Dev reset user ${process.env.DEV_RESET_USER_ID} to new-user state.`);
    } catch (err) {
      console.error('Dev reset on startup failed (server will still start):', err);
    }
  }

  serve({ fetch: app.fetch, port }, () => {
    console.log(`Hono API running on http://localhost:${port}`);
  });
}

main();
