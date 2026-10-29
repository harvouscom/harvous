import { defineConfig, devices } from '@playwright/test';

/**
 * WebKit on an iPhone-sized viewport, with no Clerk.
 *
 * The main config's `globalSetup` mints a Clerk testing token for every spec, which is why
 * nothing iOS-shaped could run without a signed-in account. These specs drive guest mode
 * (`/?try=1`) instead: no session, notes kept on the device, nothing written to the server.
 *
 * Desktop WebKit is not iOS Safari — no on-screen keyboard, no visual viewport shrink, no
 * touch selection handles. The specs assert the editor's document model where the iOS-only
 * behaviour cannot show, and save screenshots as artifacts rather than snapshot baselines.
 *
 * Own port and `reuseExistingServer: false`, so a run never measures another worktree's dev
 * server on 4322. The `/api` proxy points at a closed port: guest mode needs no API, and a run
 * must not reach whatever API another worktree happens to have running on 3001.
 *
 * Not in CI yet. Run with `npm run test:e2e:webkit` (needs `npx playwright install webkit`).
 */
const PORT = Number(process.env.WEBKIT_E2E_PORT || 4352);

export default defineConfig({
  testDir: './e2e',
  testMatch: ['guest-editor.spec.ts', 'layout-smoke.spec.ts'],
  timeout: 45_000,
  // One retry for the cold first load, when Vite may optimise dependencies and reload the page
  // mid-test. A retried pass is reported as flaky, and its trace is kept.
  retries: 1,
  outputDir: './test-results/webkit',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-first-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'webkit-iphone', use: { ...devices['iPhone 15'] } },
  ],
  webServer: {
    command: `npm run dev:spa -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      VITE_API_PROXY_TARGET: 'http://localhost:9',
    },
  },
});
