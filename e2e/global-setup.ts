import { clerkSetup } from '@clerk/testing/playwright';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env files manually before clerkSetup runs its own dotenv pass.
// This ensures PUBLIC_CLERK_PUBLISHABLE_KEY (Astro's prefix) is available.
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

/**
 * Global Playwright setup — runs once before all tests.
 * Fetches a Clerk testing token from the Clerk Backend API using CLERK_SECRET_KEY.
 * This token is used by setupClerkTestingToken() to bypass bot protection in each test.
 *
 * Astro uses PUBLIC_CLERK_PUBLISHABLE_KEY, but @clerk/testing looks for CLERK_PUBLISHABLE_KEY.
 * We bridge the two by passing the key explicitly.
 */
export default async function globalSetup() {
  const publishableKey = process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('PUBLIC_CLERK_PUBLISHABLE_KEY is not set in .env');
  }

  await clerkSetup({ publishableKey });
}
