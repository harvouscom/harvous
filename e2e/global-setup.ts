import { clerkSetup } from '@clerk/testing/playwright';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import { resolve } from 'path';
import {
  readSafeE2EConfig,
  SHARED_SPACES_RELEASE_GATE_ENV,
} from './fixtures/e2e-db-safety';

// Load the same local env files as the API and SPA.
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

/**
 * Global Playwright setup — runs once before all tests.
 * Seeds only when an explicitly disposable E2E database is configured, then
 * fetches the Clerk testing token used by authenticated browser fixtures.
 */
export default async function globalSetup() {
  if (process.env[SHARED_SPACES_RELEASE_GATE_ENV] === '1') {
    const config = readSafeE2EConfig();
    execFileSync(
      process.execPath,
      [
        resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
        'scripts/seed-e2e.ts',
      ],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: {
          ...process.env,
          SUPABASE_DATABASE_URL: config.databaseUrl,
        },
      },
    );
  }

  const publishableKey = process.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('PUBLIC_CLERK_PUBLISHABLE_KEY is not set in .env');
  }

  await clerkSetup({ publishableKey });
}
