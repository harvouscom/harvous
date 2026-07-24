import { test, expect } from './fixtures/auth';
import {
  e2eFixtureIds,
  readSafeE2EConfig,
} from './fixtures/e2e-db-safety';

let fixture: ReturnType<typeof e2eFixtureIds>;

test.describe('SpaceInvites join flow', () => {
  test.beforeAll(() => {
    fixture = e2eFixtureIds(readSafeE2EConfig());
  });

  test('authenticated non-member sees a deterministic active invite', async ({
    userAContext,
    userBContext,
  }) => {
    const removal = await userAContext.request.delete(
      `/api/spaces/${fixture.spaceId}/members/${process.env.TEST_USER_B_CLERK_ID}`,
    );
    expect([200, 404]).toContain(removal.status());
    const page = await userBContext.newPage();
    await page.goto(`/spaces/join/${fixture.inviteToken}`);
    await expect(page.getByRole('heading', { name: fixture.spaceTitle })).toBeVisible();
    await expect(page.locator('#join-space-btn')).toBeVisible();
    await page.close();
  });

  test('unauthenticated access is rejected and a member cannot pin owner content', async ({
    request,
    userBContext,
  }) => {
    const unauthorized = await request.get(
      `/api/spaces/${fixture.spaceId}/members`,
    );
    expect(unauthorized.status(), await unauthorized.text()).toBe(401);

    const redemption = await userBContext.request.post(
      `/api/spaces/invites/${fixture.inviteToken}/redeem`,
    );
    expect(redemption.ok(), await redemption.text()).toBe(true);

    const forbidden = await userBContext.request.post(
      `/api/spaces/${fixture.spaceId}/pin-item`,
      {
        data: {
          itemId: 'thread_e2e_member_cannot_pin',
          itemType: 'thread',
          isPinned: true,
        },
      },
    );
    expect(forbidden.status(), await forbidden.text()).toBe(403);

    const forbiddenCreate = await userBContext.request.post(
      '/api/threads/create',
      {
        multipart: {
          title: 'Member-owned control probe',
          color: 'paper',
          spaceId: fixture.spaceId,
          isPublic: 'false',
          selectedNoteIds: '[]',
        },
      },
    );
    expect(forbiddenCreate.status(), await forbiddenCreate.text()).toBe(403);
  });
});
