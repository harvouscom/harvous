/**
 * E2E smoke for SpaceInvites join flow (expiring invite links).
 * Uses seeded space_test_2 when TEST_USER_B credentials match seed data.
 */
import { test, expect } from './fixtures/auth';

const JOIN_URL = '/spaces/join/testToken123';
const SPACE_TITLE = 'Test Space 2';

test.describe('SpaceInvites join flow', () => {
  test('authenticated member sees join preview for a valid invite token', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await page.goto(JOIN_URL);
    await expect(page.getByText(SPACE_TITLE)).toBeVisible();
    await expect(page.locator('#join-space-btn')).toBeVisible();
    await page.close();
  });
});
