import { test as base, type BrowserContext } from '@playwright/test';
import { setupClerkTestingToken, clerk } from '@clerk/testing/playwright';

/**
 * Auth fixtures for two-user Playwright tests.
 *
 * Provides userAContext (space owner) and userBContext (joiner) as separate
 * browser contexts, each with their own Clerk session.
 *
 * Requires in .env:
 *   TEST_USER_A_EMAIL=...    (space owner — must exist in Clerk dev)
 *   TEST_USER_B_EMAIL=...    (joiner — must exist in Clerk dev)
 *   CLERK_SECRET_KEY=sk_test_...  (Backend API; issues sign-in tokens — no password needed)
 *   PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
 *
 * Sign-in uses Clerk sign-in tokens (ticket strategy), not passwords.
 */

type AuthFixtures = {
  userAContext: BrowserContext;
  userBContext: BrowserContext;
};

/** Sign in on /sign-in — avoids prototype shell redirect race on `/`. */
async function signInContext(context: BrowserContext, email: string) {
  await setupClerkTestingToken({ context });
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.waitForLoadState('domcontentloaded');
  await clerk.loaded({ page });
  await page.waitForFunction(() => window.Clerk?.client != null, undefined, { timeout: 15_000 });
  await clerk.signIn({ page, emailAddress: email });
  await page.waitForFunction(() => window.Clerk?.user != null, undefined, { timeout: 15_000 });
  await page.close();
}

export const test = base.extend<AuthFixtures>({
  userAContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await signInContext(context, process.env.TEST_USER_A_EMAIL!);
    await use(context);
    await context.close();
  },

  userBContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await signInContext(context, process.env.TEST_USER_B_EMAIL!);
    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
