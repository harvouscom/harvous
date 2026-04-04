import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
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
    reuseExistingServer: true,
    timeout: 60_000,
  },
  // Global setup to initialize Clerk testing token
  globalSetup: './e2e/global-setup.ts',
});
