import { test, expect } from '@playwright/test';

/**
 * Fixture-only gallery screenshots. No signed-in Clerk session is required;
 * the SPA can still load its publishable key through normal Vite env.
 * Run: npm run test:e2e:design-system
 */
const BASELINE_SCENES = [
  'ds-01-typography',
  'ds-02-color',
  'ds-04-section-header',
  'ds-08-empty',
  'ds-10-buttons',
  'ds-11-inputs',
  'ds-12-toasts',
] as const;

test.describe('Design system gallery baselines', () => {
  for (const scene of BASELINE_SCENES) {
    test(`scene ${scene}`, async ({ page }) => {
      await page.goto(`/__dev/design-system?scene=${scene}`);
      await expect(page.locator('.pds-gallery__heading')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.pds-gallery__canvas')).toBeVisible();
      await expect(page.locator('.pds-gallery__canvas')).toHaveScreenshot(`${scene}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
