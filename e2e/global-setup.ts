import { clerkSetup } from '@clerk/testing/playwright';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env files manually before clerkSetup runs its own dotenv pass.
// This ensures PUBLIC_CLERK_PUBLISHABLE_KEY (Astro's prefix) is available.
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

/**
 * Global Playwright setup — runs once before all tests.
 * 1. Seeds the DB used by the dev server (so shared-space-join tests find space_test_2).
 * 2. Fetches a Clerk testing token; setupClerkTestingToken() uses it to bypass bot protection.
 *
 * Astro uses PUBLIC_CLERK_PUBLISHABLE_KEY, but @clerk/testing looks for CLERK_PUBLISHABLE_KEY.
 * We bridge the two by passing the key explicitly.
 */
export default async function globalSetup() {
  // Seed the same DB the dev server uses (remote if ASTRO_DB_REMOTE_URL is set)
  try {
    const remote = process.env.ASTRO_DB_REMOTE_URL ? '--remote' : '';
    execSync(`npx astro db execute db/seed.ts ${remote}`.trim(), {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: process.env,
    });
  } catch (err) {
    // Seed may fail if rows already exist (e.g. re-run); log and continue so Clerk setup runs
    console.warn('E2E globalSetup: db seed failed (may be ok if DB already seeded):', err);
  }

  const publishableKey = process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('PUBLIC_CLERK_PUBLISHABLE_KEY is not set in .env');
  }

  await clerkSetup({ publishableKey });
}
