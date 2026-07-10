import { expect, test, type Page } from '@playwright/test';
import { SHARED_SPACES_VERIFICATION_SCENE_IDS } from '../spa/src/pages/dev/shared-spaces-design/sceneRegistry';

export const SHARED_SPACES_VERIFICATION_BASELINES =
  SHARED_SPACES_VERIFICATION_SCENE_IDS;

async function openScene(
  page: Page,
  scene: (typeof SHARED_SPACES_VERIFICATION_BASELINES)[number],
) {
  await page.goto(`/__dev/shared-spaces-design?scene=${scene}`);
  const preview = page.getByTestId('shared-spaces-scene-preview');
  await expect(preview).toBeVisible();
  return preview;
}

test.describe('Shared Spaces rendered verification scenes', () => {
  test('Activity populated', async ({ page }) => {
    const preview = await openScene(page, '21-activity-populated');
    await expect(preview.getByText('Activity', { exact: true })).toBeVisible();
    await expect(preview.locator('.proto-inspector-activity__item')).toHaveCount(2);
  });

  test('Activity detached', async ({ page }) => {
    const preview = await openScene(page, '22-activity-detached');
    await expect(preview.getByText('Passage changed', { exact: true })).toBeVisible();
    await expect(preview.getByText('Archived', { exact: true })).toHaveCount(0);
  });

  test('Activity empty omits the section', async ({ page }) => {
    const preview = await openScene(page, '23-activity-empty');
    await expect(preview.locator('[data-activity-state="empty"]')).toHaveCount(1);
    await expect(preview.getByText('Activity', { exact: true })).toHaveCount(0);
    await expect(preview.getByText('No Activity yet.', { exact: true })).toHaveCount(0);
  });

  test('owner without current Thread', async ({ page }) => {
    const preview = await openScene(page, '24-thread-owner-empty');
    await expect(preview.getByText('No thread yet.')).toBeVisible();
    await expect(preview.getByRole('button', { name: 'Start a Thread' })).toBeVisible();
  });

  test('member without current Thread', async ({ page }) => {
    const preview = await openScene(page, '25-thread-member-empty');
    await expect(preview.getByText('Waiting for the owner to start one.')).toBeVisible();
    await expect(preview.getByRole('button', { name: 'Start a Thread' })).toHaveCount(0);
  });

  test('owner with current Thread', async ({ page }) => {
    const preview = await openScene(page, '26-thread-owner-current');
    await expect(preview.getByRole('button', { name: /Life together in Romans 12/ })).toBeVisible();
  });

  test('member with current Thread', async ({ page }) => {
    const preview = await openScene(page, '27-thread-member-current');
    await expect(preview.getByRole('button', { name: /Witnesses in Acts/ })).toBeVisible();
    await expect(preview.getByRole('button', { name: /Start|Pin|Set current/i })).toHaveCount(0);
  });
});
