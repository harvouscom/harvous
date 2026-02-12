import { test as base, expect } from '@playwright/test';
import { test, expect as authExpect } from './fixtures/auth';

/**
 * E2E tests for the shared space join flow.
 *
 * Uses the seeded `space_test_2` which has:
 *   - isPublic: true
 *   - shareToken: 'testToken123' (exactly 12 alphanumeric chars — required by isValidShareToken)
 *   - Join URL: /spaces/join/testToken123
 *
 * Prerequisites (the DB the dev server uses must be seeded before e2e):
 * 1. Add test user credentials to .env (see e2e/fixtures/auth.ts): TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD.
 * 2. Seed the same DB your dev server uses:
 *    - If dev uses remote DB (e.g. ASTRO_DB_REMOTE_URL set): run `npx astro db execute db/seed.ts --remote` before e2e, or use `npm run test:e2e:setup`.
 *    - If dev uses local DB: ensure `npm run dev` has been run so local DB is seeded, or run `npx astro db execute db/seed.ts` before e2e.
 * 3. For test 5 ("Owner sees increased member count"): set TEST_USER_A_CLERK_ID in .env to the Clerk user ID of the account used as TEST_USER_A_EMAIL (from Clerk Dashboard → Users). Then re-run the seed so space_test_2 is owned by User A.
 * 4. Start (or let Playwright start) the dev server; tests use baseURL http://localhost:4321.
 */

const JOIN_URL = '/spaces/join/testToken123';
const SPACE_TITLE = 'Test Space 2';

// ─── Test 1: Unauthenticated preview ────────────────────────────────────────
// Uses plain Playwright (no auth fixture) to simulate an anonymous visitor.

base.describe('Unauthenticated join page', () => {
  base.test('shows space preview and sign-in prompt', async ({ page }) => {
    await page.goto(JOIN_URL);

    // Space title should be visible
    await expect(page.getByText(SPACE_TITLE)).toBeVisible();

    // Unauthenticated: CTA is a link "Join this space on Harvous" that goes to sign-in
    await expect(page.getByRole('link', { name: /join this space on harvous/i })).toBeVisible();
    // The actual join button (for authenticated users) should NOT be visible
    await expect(page.locator('#join-space-btn')).not.toBeVisible();
  });

  base.test('join link points to sign-in with redirect back to join page', async ({ page }) => {
    await page.goto(JOIN_URL);

    const joinLink = page.getByRole('link', { name: /join this space on harvous/i });
    const href = await joinLink.getAttribute('href');

    // href should point to sign-in with redirect back to this join page
    expect(href).toContain('/sign-in');
    expect(href).toContain('/spaces/join/');
  });
});

// ─── Test 2: Authenticated non-member sees join button ──────────────────────

test.describe('Authenticated non-member', () => {
  test('sees the join button on the space preview page', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await page.goto(JOIN_URL);

    // Should show the space title
    await authExpect(page.getByText(SPACE_TITLE)).toBeVisible();

    // Join button should be present (not "Sign in to join")
    await authExpect(
      page.getByRole('button', { name: /join space on harvous/i })
    ).toBeVisible();

    // Unauthenticated CTA (link to sign-in) should NOT be the primary CTA
    await authExpect(
      page.locator('#join-space-btn')
    ).toBeVisible();
  });
});

// ─── Test 3: Full two-user join flow ─────────────────────────────────────────

test.describe('Full join flow', () => {
  test('User B joins space, then is redirected to the space', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await page.goto(JOIN_URL);

    // Click the join button
    await page.getByRole('button', { name: /join space on harvous/i }).click();

    // Should redirect to the space page after joining
    // The join endpoint returns redirectUrl: /spaces/{spaceId}
    await authExpect(page).toHaveURL(/\/spaces\//, { timeout: 8_000 });
  });

  test('Owner sees increased member count after User B joins', async ({ userAContext, userBContext }) => {
    // User B: join the space first
    const pageB = await userBContext.newPage();
    await pageB.goto(JOIN_URL);

    const joinButton = pageB.getByRole('button', { name: /join space on harvous/i });

    // If User B is already a member (from a previous test run), the button won't be there
    // — that's fine, the member count check below still applies
    const isJoinVisible = await joinButton.isVisible();
    if (isJoinVisible) {
      await joinButton.click();
      await authExpect(pageB).toHaveURL(/\/spaces\//, { timeout: 8_000 });
    }

    // User A: navigate to home and open EditSpacePanel for space_test_2
    // The People tab badge should show ≥ 2 people
    const pageA = await userAContext.newPage();
    await pageA.goto('/');

    // Find and click the space to open its panel
    // The space is named "Test Space 2"
    await pageA.getByText(SPACE_TITLE).first().click();

    // Look for the People tab in the EditSpacePanel TabNav
    const peopleTab = pageA.getByRole('button', { name: /people/i });
    await authExpect(peopleTab).toBeVisible({ timeout: 5_000 });

    // The People tab badge count should be ≥ 2 (owner + at least User B)
    // The badge text is rendered inside the tab
    const peopleTabText = await peopleTab.textContent();
    const match = peopleTabText?.match(/\d+/);
    const memberCount = match ? parseInt(match[0], 10) : 0;
    expect(memberCount).toBeGreaterThanOrEqual(2);
  });
});
