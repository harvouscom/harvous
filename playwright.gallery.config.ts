import { defineConfig, devices } from '@playwright/test';

/**
 * Dev-gallery routes do not require a signed-in Clerk session or database seed.
 * The SPA may still load its normal publishable Clerk key from local Vite env.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'design-system-gallery.spec.ts',
    'shared-spaces-design-gallery.spec.ts',
    // Measures rendered widths across every gallery scene. Lives here rather than in the
    // general suite because it needs the galleries served, and they are what this config runs.
    'marquee-width.spec.ts',
  ],
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'gallery-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev:spa',
    url: 'http://localhost:4322',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
