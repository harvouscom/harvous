import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from './fixtures/auth';
import {
  e2eFixtureIds,
  readSafeE2EConfig,
} from './fixtures/e2e-db-safety';

let fixture: ReturnType<typeof e2eFixtureIds>;

test.describe.configure({ mode: 'serial' });
test.describe('current SpaceInvites join flow', () => {
  test.beforeAll(() => {
    fixture = e2eFixtureIds(readSafeE2EConfig());
  });

  test('signed-out member signs in, returns to the invite, and joins', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const joinPath = `/spaces/join/${fixture.inviteToken}`;

    await page.goto(joinPath);
    await expect(page.getByRole('heading', { name: fixture.spaceTitle })).toBeVisible();

    const joinLink = page.getByRole('link', { name: /join this space/i });
    await expect(joinLink).toBeVisible();
    const href = await joinLink.getAttribute('href');
    expect(href).toContain('/sign-in');
    expect(href).toMatch(/spaces(?:%2F|\/)join/i);

    await joinLink.click();
    await expect(page).toHaveURL(/\/sign-in/);
    await setupClerkTestingToken({ page });
    await clerk.signIn({ page, emailAddress: process.env.TEST_USER_B_EMAIL! });

    await expect(page).toHaveURL(new RegExp(`/spaces/join/${fixture.inviteToken}`), {
      timeout: 20_000,
    });
    const joinButton = page.locator('#join-space-btn');
    const goToSpace = page
      .getByRole('link', { name: /go to space/i })
      .or(page.getByRole('button', { name: /go to space/i }));
    await expect(joinButton.or(goToSpace)).toBeVisible();
    if (await joinButton.isVisible()) {
      await joinButton.click();
    } else {
      await goToSpace.click();
    }
    await expect(page).toHaveURL('/');
    await context.close();
  });

  test('owner API sees the joined member on current membership rails', async ({
    userAContext,
  }) => {
    const response = await userAContext.request.get(
      `/api/spaces/${fixture.spaceId}/members`,
    );
    expect(response.ok(), await response.text()).toBe(true);
    const payload = (await response.json()) as {
      members: Array<{ userId: string; role: string }>;
    };
    expect(payload.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: process.env.TEST_USER_A_CLERK_ID,
          role: 'owner',
        }),
        expect.objectContaining({
          userId: process.env.TEST_USER_B_CLERK_ID,
          role: 'member',
        }),
      ]),
    );
  });
});
