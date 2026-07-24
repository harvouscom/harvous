import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { resolve } from 'path';
import {
  readSafeE2EConfig,
  SHARED_SPACES_RELEASE_GATE_ENV,
} from './e2e/fixtures/e2e-db-safety';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

export const PROTECTED_SHARED_SPACES_SPECS = [
  '**/shared-space-join.spec.ts',
  '**/shared-spaces-collaboration.spec.ts',
  '**/space-invites.spec.ts',
] as const;

export function playwrightTestIgnore(
  sharedSpacesReleaseGateEnabled: boolean,
): string[] {
  return [
    '**/invitation-accept.spec.ts',
    ...(sharedSpacesReleaseGateEnabled
      ? []
      : PROTECTED_SHARED_SPACES_SPECS),
  ];
}

export function definedEnvironment(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

const sharedSpacesReleaseGateEnabled =
  process.env[SHARED_SPACES_RELEASE_GATE_ENV] === '1';
const safeE2EConfig = sharedSpacesReleaseGateEnabled
  ? readSafeE2EConfig()
  : null;
const webServerEnv: Record<string, string> = {
  ...definedEnvironment(process.env),
  ...(safeE2EConfig
    ? { SUPABASE_DATABASE_URL: safeE2EConfig.databaseUrl }
    : {}),
};

export default defineConfig({
  testDir: './e2e',
  // Retired v1 SpaceInvitations coverage remains as history, but the active
  // harness verifies signed-out return and redemption through SpaceInvites.
  // Fail-closed release specs are excluded from generic Playwright commands.
  testIgnore: playwrightTestIgnore(sharedSpacesReleaseGateEnabled),
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Reuse existing dev server if already running, otherwise start one
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4322',
    // A disposable run must own the API process so it cannot accidentally reuse
    // a localhost server connected to another (potentially production) database.
    reuseExistingServer: safeE2EConfig === null,
    timeout: 60_000,
    env: webServerEnv,
  },
  // Global setup to initialize Clerk testing token
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
