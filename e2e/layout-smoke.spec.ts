import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { stubGuestApi } from './fixtures/guest-api-stub';

/**
 * Home, the reader and a guest note at the two phone sizes that break layouts first: the
 * smallest supported portrait (iPhone SE, 320×568) and a landscape phone (844×390).
 *
 * Runs from `playwright.webkit.config.ts` as a guest — no Clerk, no API (see `stubGuestApi`).
 * Screenshots are attached to the report as artifacts to look at, not snapshot baselines: these
 * assert only that nothing scrolls sideways and the toolbar and paper are on screen.
 */

const VIEWPORTS = [
  { name: 'portrait-320x568', width: 320, height: 568 },
  { name: 'landscape-844x390', width: 844, height: 390 },
] as const;

const TOOLBAR = '.proto-shell__toolbar-cell';

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'document scrolls sideways').toBeLessThanOrEqual(innerWidth);
}

/** Visible and at least partly inside the viewport — `toBeVisible` alone passes off-screen. */
async function expectOnScreen(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await expect(el, selector).toBeVisible();
  await expect(el, `${selector} is inside the viewport`).toBeInViewport();
}

async function dismissUpdateToast(page: Page) {
  // The dev server's update toast can sit over the paper; it is not what these specs measure.
  const toast = page.locator('.proto-update-toast');
  if (await toast.isVisible().catch(() => false)) {
    await toast.getByRole('button', { name: /dismiss|close/i }).click().catch(() => {});
  }
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  // Written under test-results/webkit/ and attached to the report — an artifact, never a baseline.
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const vp of VIEWPORTS) {
  test.describe(`layout smoke ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await stubGuestApi(page);
      await page.goto('/?try=1');
      await expect(page.locator(TOOLBAR)).toBeVisible();
    });

    test('Home', async ({ page }, testInfo) => {
      await expectOnScreen(page, '.proto-feed-sheet');
      await dismissUpdateToast(page);
      await expectOnScreen(page, TOOLBAR);
      await expectNoHorizontalOverflow(page);
      await capture(page, testInfo, `home-${vp.name}`);
    });

    test('reader', async ({ page }, testInfo) => {
      await page.getByRole('button', { name: 'Read the Bible' }).click();
      await expect(page).toHaveURL(/\/read\//);
      await expect(page.locator('.pds-reader__verse').first()).toBeVisible();
      await dismissUpdateToast(page);
      await expectOnScreen(page, '.pds-reader__column');
      await expectOnScreen(page, TOOLBAR);
      await expectNoHorizontalOverflow(page);
      await capture(page, testInfo, `reader-${vp.name}`);
    });

    test('guest note', async ({ page }, testInfo) => {
      await page.getByRole('button', { name: 'New note in My Home' }).click();
      const editor = page.locator('.ProseMirror').first();
      await expect(editor).toBeVisible();
      await editor.focus();
      // A long unbroken run and a pill are what push a narrow paper wider than the screen.
      await page.keyboard.type('Notes on Exodus 32:1-35 ', { delay: 10 });
      await page.getByRole('button', { name: 'Confirm scripture reference' }).click();
      await page.keyboard.type('the people said, Up, make us gods, which shall go before us; '.repeat(3));
      await page.keyboard.type('supercalifragilisticexpialidociousandthensomemoretextwithoutbreaks');
      await expect(editor.locator('span.scripture-pill[data-scripture-reference]')).toBeVisible();
      await dismissUpdateToast(page);
      await expectOnScreen(page, '.proto-editor-paper');
      await expectOnScreen(page, TOOLBAR);
      await expectNoHorizontalOverflow(page);
      await capture(page, testInfo, `note-${vp.name}`);
    });
  });
}
