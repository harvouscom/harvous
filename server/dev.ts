/**
 * Local development server for the Hono API.
 *
 * Runs on port 3001 alongside the Astro dev server (4321)
 * and the SPA Vite dev server (4322).
 *
 * Usage: npx tsx watch server/dev.ts
 *
 * Requires .env to be loaded (ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN, CLERK_SECRET_KEY).
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(import.meta.dirname || __dirname, '..', '.env') });

import { serve } from '@hono/node-server';
import app from './app';

const port = parseInt(process.env.API_PORT || '3001', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Hono API running on http://localhost:${port}`);
});
