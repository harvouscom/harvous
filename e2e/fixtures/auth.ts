import { test as base, type BrowserContext } from '@playwright/test';
import { setupClerkTestingToken, clerk } from '@clerk/testing/playwright';

/**
 * Auth fixtures for two-user Playwright tests.
 *
 * Provides userAContext (space owner) and userBContext (joiner) as separate
 * browser contexts, each with their own Clerk session.
 *
 * Requires in .env:
 *   TEST_USER_A_EMAIL=...    (the space owner account)
 *   TEST_USER_A_PASSWORD=...
 *   TEST_USER_B_EMAIL=...    (the joiner account)
 *   TEST_USER_B_PASSWORD=...
 *
 * Both accounts must exist in the Clerk dev environment.
 * Create them at https://dashboard.clerk.com → Users.
 */

type AuthFixtures = {
  userAContext: BrowserContext;
  userBContext: BrowserContext;
};

export const test = base.extend<AuthFixtures>({
  // User A: the space owner
  userAContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to home first (clerk.signIn requires a page with Clerk loaded)
    await page.goto('/');
    await setupClerkTestingToken({ page });
    await clerk.signIn({
      page,
      signInParams: {
        strategy: 'password',
        identifier: process.env.TEST_USER_A_EMAIL!,
        password: process.env.TEST_USER_A_PASSWORD!,
      },
    });

    await use(context);
    await context.close();
  },

  // User B: the joiner
  userBContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to home first (clerk.signIn requires a page with Clerk loaded)
    await page.goto('/');
    await setupClerkTestingToken({ page });
    await clerk.signIn({
      page,
      signInParams: {
        strategy: 'password',
        identifier: process.env.TEST_USER_B_EMAIL!,
        password: process.env.TEST_USER_B_PASSWORD!,
      },
    });

    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
