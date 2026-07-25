import { test, expect } from './fixtures/auth';
import {
  grantSharedSpacesAddon,
  openSpaceSwitcherMenu,
  requireSharedSpacesEnv,
  waitForAppShell,
} from './shared-spaces-helpers';

/**
 * Post-checkout entitlement cache: the space switcher should unlock when
 * `sharedSpacesEntitlementSynced` fires, even if subscription/status was stale.
 */
test.describe('Shared Spaces entitlement cache', () => {
  test.beforeAll(() => {
    requireSharedSpacesEnv();
  });

  test.afterAll(async ({ userAContext }) => {
    await grantSharedSpacesAddon(userAContext.request, true);
  });

  test('space switcher hides Plus badge after entitlement sync event', async ({ userAContext }) => {
    await grantSharedSpacesAddon(userAContext.request, false);

    const page = await userAContext.newPage();
    await waitForAppShell(page);

    await page.route('**/api/subscription/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hasUnlimited: false,
          hasSharedSpaces: false,
          entitlements: [],
          planKey: null,
          limits: { ownedSpaces: 0, membersPerSpace: 30 },
          currentCount: 0,
          limit: null,
          sharedSpacesOwnedCount: 0,
          sharedSpacesOwnedLimit: 0,
        }),
      });
    });

    await page.reload();
    await page.locator('.proto-sidebar-root, .proto-sidebar-toolbar').first().waitFor({ timeout: 20_000 });

    await openSpaceSwitcherMenu(page);
    const newSharedItem = page.getByRole('menuitem', { name: 'New shared space' });
    await expect(newSharedItem.locator('.proto-menu-item__badge')).toHaveText('Plus');

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('sharedSpacesEntitlementSynced', {
          detail: { hasSharedSpaces: true, updated: true, entitlements: ['shared_spaces'] },
        }),
      );
    });

    await page.keyboard.press('Escape');
    await openSpaceSwitcherMenu(page);
    const unlockedItem = page.getByRole('menuitem', { name: 'New shared space' });
    await expect(unlockedItem.locator('.proto-menu-item__badge')).toHaveCount(0);
    await expect(unlockedItem).toBeEnabled();
    await expect(page.getByText(/used all 0 shared spaces/i)).not.toBeVisible();
  });

  test('create shared space lands in shared sidebar view', async ({ userAContext }) => {
    await grantSharedSpacesAddon(userAContext.request, true);

    const spaceTitle = `E2E Create ${Date.now()}`;
    const page = await userAContext.newPage();
    await waitForAppShell(page);

    await openSpaceSwitcherMenu(page);
    await page.getByRole('menuitem', { name: 'New shared space' }).click();
    const dialog = page.getByRole('dialog', { name: /new shared space/i });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Space name').fill(spaceTitle);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.getByRole('heading', { name: spaceTitle }).or(page.locator('.proto-shared-space-header__title', { hasText: spaceTitle }))).toBeVisible({
      timeout: 15_000,
    });

    await openSpaceSwitcherMenu(page);
    await expect(page.getByRole('menuitemradio', { name: spaceTitle })).toBeVisible();
  });
});
