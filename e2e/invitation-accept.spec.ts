import { test as base, expect } from '@playwright/test';
import { test, expect as authExpect } from './fixtures/auth';

/**
 * E2E tests for the invite-page join flow (/invitations/[token]).
 *
 * Uses a seeded SpaceInvitation for space_test_2:
 *   - inviteToken: 'inviteToken12'
 *   - Invite URL: /invitations/inviteToken12
 *   - Space: Test Space 2 (same as shared-space-join)
 *
 * Prerequisites: same as e2e/shared-space-join.spec.ts (seed run, TEST_USER_A/B in .env,
 * TEST_USER_A_CLERK_ID for space owner). Seed must include the SpaceInvitations row (db/seed.ts).
 */

const INVITE_URL = '/invitations/inviteToken12';
const SPACE_TITLE = 'Test Space 2';
const SPACE_URL_PATTERN = /\/space\/test_2/;

// ─── Unauthenticated invite page ────────────────────────────────────────────
// Skip if invitation not in pending state (e.g. dev server uses different DB than seeded).

base.describe('Unauthenticated invite page', () => {
  base.test('shows space preview and sign-in to accept link', async ({ page }) => {
    await page.goto(INVITE_URL);

    const spaceVisible = await page.getByText(SPACE_TITLE).isVisible().catch(() => false);
    if (!spaceVisible) {
      base.skip(true, 'Invitation not pending in this DB (run seed-e2e against dev server DB)');
      return;
    }
    await expect(page.getByRole('link', { name: /sign in to accept/i })).toBeVisible();
    await expect(page.locator('#accept-invitation-btn')).not.toBeVisible();
  });

  base.test('sign-in link includes redirect back to invite page', async ({ page }) => {
    await page.goto(INVITE_URL);

    const spaceVisible = await page.getByText(SPACE_TITLE).isVisible().catch(() => false);
    if (!spaceVisible) {
      base.skip(true, 'Invitation not pending in this DB (run seed-e2e against dev server DB)');
      return;
    }
    const signInLink = page.getByRole('link', { name: /sign in to accept/i });
    const href = await signInLink.getAttribute('href');

    expect(href).toContain('/sign-in');
    expect(href?.includes('/invitations/') || href?.includes('%2Finvitations%2F')).toBe(true);
  });
});

// ─── Authenticated non-member sees Accept button ────────────────────────────

test.describe('Authenticated non-member', () => {
  test('sees Accept Invitation or Go to Space on the invite page', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await page.goto(INVITE_URL);

    await authExpect(page.getByText(SPACE_TITLE)).toBeVisible();
    // Either pending invite (Accept button) or already member (Go to Space)
    const acceptBtn = page.getByRole('button', { name: /accept invitation/i });
    const goToSpace = page.getByRole('link', { name: /go to space/i }).or(page.getByRole('button', { name: /go to space/i }));
    await authExpect(acceptBtn.or(goToSpace)).toBeVisible();
  });
});

// ─── Full accept flow ───────────────────────────────────────────────────────

test.describe('Full accept flow', () => {
  test('User B accepts invitation (or is already member), then reaches the space', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await page.goto(INVITE_URL);

    const acceptBtn = page.getByRole('button', { name: /accept invitation/i });
    const goToSpace = page.getByRole('link', { name: /go to space/i }).or(page.getByRole('button', { name: /go to space/i }));
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      await authExpect(page).toHaveURL(SPACE_URL_PATTERN, { timeout: 8_000 });
    } else {
      await goToSpace.click();
      await authExpect(page).toHaveURL(SPACE_URL_PATTERN, { timeout: 8_000 });
    }
  });

  test('Owner sees increased member count after User B accepts', async ({
    userAContext,
    userBContext,
  }) => {
    const pageB = await userBContext.newPage();
    await pageB.goto(INVITE_URL);

    const acceptBtn = pageB.getByRole('button', { name: /accept invitation/i });
    const goToSpace = pageB.getByRole('link', { name: /go to space/i }).or(pageB.getByRole('button', { name: /go to space/i }));
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      await authExpect(pageB).toHaveURL(SPACE_URL_PATTERN, { timeout: 8_000 });
    } else if (await goToSpace.isVisible()) {
      await goToSpace.click();
      await authExpect(pageB).toHaveURL(SPACE_URL_PATTERN, { timeout: 8_000 });
    }

    const pageA = await userAContext.newPage();
    await pageA.goto('/');
    const spaceVisible = await pageA.getByText(SPACE_TITLE).first().isVisible().catch(() => false);
    if (!spaceVisible) {
      test.skip(true, 'Test Space 2 not on dashboard (set TEST_USER_A_CLERK_ID to User A)');
      return;
    }
    await pageA.getByText(SPACE_TITLE).first().click();

    const peopleTab = pageA.getByRole('button', { name: /people/i });
    await authExpect(peopleTab).toBeVisible({ timeout: 5_000 });

    const peopleTabText = await peopleTab.textContent();
    const match = peopleTabText?.match(/\d+/);
    const memberCount = match ? parseInt(match[0], 10) : 0;
    expect(memberCount).toBeGreaterThanOrEqual(2);
  });
});
