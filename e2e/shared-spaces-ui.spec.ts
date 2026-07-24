import { test, expect } from './fixtures/auth';
import {
  createInviteViaApi,
  createNoteInSpaceViaApi,
  createSharedSpaceViaApi,
  deleteSpaceViaApi,
  ensureScreenshotDir,
  getPersonalHomeSpaceId,
  grantSharedSpacesAddon,
  logScreenshotDir,
  openManageSubView,
  openPeopleSheet,
  openSpaceSwitcherMenu,
  removeMemberViaApi,
  requireSharedSpacesEnv,
  resetScreenshotIndex,
  selectSpaceInSwitcher,
  sharedSpaceNoteRow,
  snap,
  typeInNoteBodyAndWaitForSave,
  waitForAppShell,
  writeScreenshotManifest,
} from './shared-spaces-helpers';

/**
 * Shared Spaces UI screenshot tour — captures every major touch point for design review.
 *
 * Prerequisites (.env):
 *   TEST_USER_A_EMAIL  — space owner (User A), e.g. testowner@example.com
 *   TEST_USER_B_EMAIL  — joiner (User B), e.g. testjoiner@example.com
 *   CLERK_SECRET_KEY   — sk_test_… (sign-in tokens; no password needed)
 *   PUBLIC_CLERK_PUBLISHABLE_KEY — pk_test_… (Clerk **development** instance)
 *
 * Both test users must exist in the same Clerk development app as your local `.env`.
 *
 * Run:
 *   npm run test:e2e:shared-spaces
 *
 * Screenshots land in (absolute path under the directory you run the command from):
 *   test-results/shared-spaces-screenshots/
 *   e.g. …/shared-spaces-foundation/test-results/shared-spaces-screenshots/
 *   Each PNG is logged during the run; see README.txt in that folder when the suite finishes.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Shared Spaces UI screenshot tour', () => {
  test.setTimeout(180_000);

  const runId = Date.now();
  const spaceTitle = `E2E Study ${runId}`;
  let spaceId = '';
  let invitePath = '';
  let ownerNoteTitle = `Owner note ${runId}`;
  let memberNoteTitle = `Member note ${runId}`;

  test.beforeAll(() => {
    requireSharedSpacesEnv();
    ensureScreenshotDir();
    resetScreenshotIndex();
    logScreenshotDir();
  });

  test.afterAll(() => {
    writeScreenshotManifest();
  });

  test('01 — /addon page (User B, no add-on)', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await page.goto('/addon');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Shared Spaces' })).toBeVisible({ timeout: 15_000 });
    await snap(page, 'addon-page-user-b-no-addon');
  });

  test('02 — Settings › Add-ons (User A, before grant)', async ({ userAContext }) => {
    const page = await userAContext.newPage();
    await page.goto('/settings/addons');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Shared Spaces')).toBeVisible({ timeout: 15_000 });
    await snap(page, 'settings-addons-before-grant');
  });

  test('03 — Grant add-on + create space via API (User A)', async ({ userAContext }) => {
    await grantSharedSpacesAddon(userAContext.request, true);
    const space = await createSharedSpaceViaApi(userAContext.request, spaceTitle, 'purple');
    spaceId = space.id;
    const invite = await createInviteViaApi(userAContext.request, spaceId);
    invitePath = `/spaces/join/${invite.token}`;
    await createNoteInSpaceViaApi(userAContext.request, spaceId, 'Owner-authored content for read-only test.', ownerNoteTitle);
  });

  test('04 — /addon active state (User A)', async ({ userAContext }) => {
    const page = await userAContext.newPage();
    await page.goto('/addon');
    await expect(page.getByText(/Shared Spaces is active/i)).toBeVisible({ timeout: 15_000 });
    await snap(page, 'addon-page-user-a-active');
  });

  test('05 — Settings › Add-ons active badge (User A)', async ({ userAContext }) => {
    const page = await userAContext.newPage();
    await page.goto('/settings/addons');
    await expect(page.getByText('Active')).toBeVisible({ timeout: 10_000 });
    await snap(page, 'settings-addons-active');
  });

  test('06 — Space switcher menu (User A)', async ({ userAContext }) => {
    const page = await userAContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, spaceTitle);
    await openSpaceSwitcherMenu(page);
    await snap(page, 'space-switcher-menu-with-space', { fullPage: false });
    await page.keyboard.press('Escape');
  });

  test('07 — New shared space dialog + color picker (User A)', async ({ userAContext }) => {
    const page = await userAContext.newPage();
    await waitForAppShell(page);
    await openSpaceSwitcherMenu(page);
    await page.getByRole('menuitem', { name: 'New shared space' }).click();
    const dialog = page.getByRole('dialog', { name: /new shared space/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder('Space name')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Choose cover image' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Choose color' }).click();
    await expect(dialog.getByRole('radiogroup', { name: 'Color' })).toBeVisible();
    await snap(page, 'space-switcher-create-form-colors', { fullPage: false });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('08 — Shared space sidebar view (User A)', async ({ userAContext }) => {
    const page = await userAContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, spaceTitle);
    await expect(page.getByText(spaceTitle).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(ownerNoteTitle).first()).toBeVisible({ timeout: 15_000 });
    await snap(page, 'shared-space-sidebar-owner', { fullPage: false });
  });

  test('09 — Manage space hub + invite links sub-view (User A)', async ({ userAContext }) => {
    const page = await userAContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, spaceTitle);
    await openPeopleSheet(page);
    // Owner sheet opens on the hub: People / Invite links / Space settings rows.
    const sheet = page.getByRole('dialog', { name: /people in/i });
    await expect(sheet.getByRole('button', { name: /^People/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Invite links/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /^Space settings/ })).toBeVisible();
    await snap(page, 'manage-space-owner-hub', { fullPage: false });

    // Drill into the invite-links sub-view.
    await openManageSubView(page, 'Invite links');
    await expect(sheet.getByRole('button', { name: 'New invite link' })).toBeVisible();
    await snap(page, 'manage-space-invite-links', { fullPage: false });
  });

  test('10 — Join page logged out (User B context, no cookies)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(invitePath);
    await expect(page.getByRole('heading', { name: spaceTitle })).toBeVisible({ timeout: 15_000 });
    // Logged-out CTA is a sign-in link labeled "Join this space".
    await expect(page.getByRole('link', { name: /join this space/i })).toBeVisible();
    await snap(page, 'join-page-logged-out');
    await context.close();
  });

  test('11 — Join page logged in before join (User B)', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await page.goto(invitePath);
    await expect(page.getByRole('heading', { name: spaceTitle })).toBeVisible({ timeout: 15_000 });
    const joinBtn = page.locator('#join-space-btn');
    const goBtn = page.getByRole('button', { name: /go to space/i });
    await expect(joinBtn.or(goBtn)).toBeVisible({ timeout: 10_000 });
    await snap(page, 'join-page-user-b-before-join');
  });

  test('12 — User B joins and lands in shared space', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await page.goto(invitePath);
    await expect(page.getByRole('heading', { name: spaceTitle })).toBeVisible({ timeout: 15_000 });
    const joinBtn = page.locator('#join-space-btn');
    const goBtn = page.getByRole('button', { name: /go to space/i });
    await expect(joinBtn.or(goBtn)).toBeVisible({ timeout: 15_000 });
    if (await joinBtn.isVisible()) {
      await joinBtn.click();
    } else {
      await goBtn.click();
    }
    await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
    await page.locator('.proto-sidebar-root, .proto-sidebar-toolbar').first().waitFor({ timeout: 20_000 });
    await selectSpaceInSwitcher(page, spaceTitle);
    await expect(page.getByText(spaceTitle).first()).toBeVisible({ timeout: 15_000 });
    await snap(page, 'shared-space-sidebar-member-after-join', { fullPage: false });
  });

  test('13 — Member composes a note (User B)', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, spaceTitle);
    // Compose via the toolbar "New note" button. The compose target follows the
    // persisted space selection (composeTargetSpaceId in PrototypeNotePage), so a
    // fresh draft lands in the active shared space rather than personal My Home —
    // this also guards the nav-readiness race that previously misrouted the note.
    const composeBtn = page.getByRole('button', { name: 'New note' }).first();
    await composeBtn.click();
    await typeInNoteBodyAndWaitForSave(page, memberNoteTitle);
    await snap(page, 'member-composing-own-note', { fullPage: false });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.proto-sidebar-root, .proto-sidebar-toolbar').first().waitFor({ timeout: 20_000 });
    await selectSpaceInSwitcher(page, spaceTitle);
    await expect(sharedSpaceNoteRow(page, memberNoteTitle).first()).toBeVisible({ timeout: 20_000 });
    await snap(page, 'shared-space-list-with-author-chips', { fullPage: false });
  });

  test('14 — Read-only banner on owner note (User B)', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, spaceTitle);
    await page.getByText(ownerNoteTitle).first().click();
    await expect(page.getByText('Editing is off', { exact: true })).toBeVisible({ timeout: 15_000 });
    await snap(page, 'read-only-foreign-note-banner', { fullPage: false });
  });

  test('15 — Editable own note, no banner (User B)', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, spaceTitle);
    await sharedSpaceNoteRow(page, memberNoteTitle).first().click();
    await expect(page.getByText('Editing is off', { exact: true })).not.toBeVisible();
    await expect(page.locator('.tiptap, .ProseMirror, [contenteditable="true"]').first()).toBeVisible();
    await snap(page, 'editable-own-note-no-banner', { fullPage: false });
  });

  test('16 — Copy to shared space menu (User A, personal note)', async ({ userAContext }) => {
    const homeId = await getPersonalHomeSpaceId(userAContext.request);
    const personalTitle = `Personal copy source ${runId}`;
    await createNoteInSpaceViaApi(userAContext.request, homeId, 'Copy this note into the shared space.', personalTitle);

    const page = await userAContext.newPage();
    await waitForAppShell(page);
    await openSpaceSwitcherMenu(page);
    await page.getByRole('menuitemradio', { name: 'My Home' }).click();
    await page.getByText(personalTitle).first().click();
    await page.locator('.tiptap, .ProseMirror, [contenteditable="true"]').first().waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: /more options/i }).click();
    await page.getByRole('menuitem', { name: /copy to shared space/i }).click();
    await expect(page.getByRole('menuitem', { name: spaceTitle })).toBeVisible({ timeout: 8_000 });
    await snap(page, 'copy-to-shared-space-submenu', { fullPage: false });
    await page.keyboard.press('Escape');
  });

  test('17 — Revoke invite confirm dialog (User A)', async ({ userAContext }) => {
    const page = await userAContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, spaceTitle);
    await openPeopleSheet(page);
    await openManageSubView(page, 'Invite links');
    const revokeBtn = page.getByRole('button', { name: 'Revoke link' }).first();
    await revokeBtn.click();
    await expect(page.getByRole('dialog', { name: /revoke this invite link/i })).toBeVisible();
    await snap(page, 'confirm-revoke-invite-dialog', { fullPage: false });
    await page.getByRole('button', { name: 'Keep' }).click();
  });

  test('18 — Leave space confirm dialog (User B)', async ({ userBContext }) => {
    const page = await userBContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, spaceTitle);
    await openPeopleSheet(page);
    const leaveBtn = page.getByRole('button', { name: 'Leave space' });
    await leaveBtn.click();
    await expect(page.getByRole('dialog', { name: /leave this space/i })).toBeVisible();
    await snap(page, 'confirm-leave-space-dialog', { fullPage: false });
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('19 — Remove member confirm dialog (User A)', async ({ userAContext }) => {
    const pageA = await userAContext.newPage();
    await waitForAppShell(pageA);
    await selectSpaceInSwitcher(pageA, spaceTitle);
    await openPeopleSheet(pageA);
    await openManageSubView(pageA, 'People');
    const sheet = pageA.getByRole('dialog', { name: /people in/i });
    const memberRow = sheet.getByRole('button', { name: 'Remove' }).first();
    if (!(await memberRow.isVisible().catch(() => false))) {
      test.skip(true, 'No removable member row visible');
      return;
    }
    await memberRow.click();
    await expect(pageA.getByRole('dialog', { name: /remove/i })).toBeVisible();
    await snap(pageA, 'confirm-remove-member-dialog', { fullPage: false });
    await pageA.getByRole('button', { name: 'Cancel' }).click();
  });

  test('20 — Delete space redirects to My Home (User A)', async ({ userAContext }) => {
    const page = await userAContext.newPage();
    await waitForAppShell(page);
    await selectSpaceInSwitcher(page, spaceTitle);
    await openPeopleSheet(page);
    await openManageSubView(page, 'Space settings');
    await page.getByRole('button', { name: 'Delete space' }).click();
    const confirmDialog = page.getByRole('dialog', { name: /delete/i });
    await expect(confirmDialog).toBeVisible();
    await snap(page, 'confirm-delete-space-dialog', { fullPage: false });
    const deleteResponse = page.waitForResponse(
      (r) => r.url().includes('/api/spaces/delete') && r.ok(),
      { timeout: 15_000 },
    );
    await confirmDialog.getByRole('button', { name: 'Delete' }).click();
    await deleteResponse;
    await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
    await expect(page.getByRole('dialog', { name: /people in/i })).toBeHidden({ timeout: 5_000 });
    await openSpaceSwitcherMenu(page);
    await expect(page.getByRole('menuitemradio', { name: spaceTitle })).toHaveCount(0);
    await expect(page.getByRole('menuitemradio', { name: 'My Home' })).toBeVisible();
    spaceId = '';
  });

  test('21 — Cleanup test space (User A)', async ({ userAContext, userBContext }) => {
    if (!spaceId) return;
    try {
      const profileB = await userBContext.request.get('/api/user/get-profile');
      if (profileB.ok()) {
        const bUserId = ((await profileB.json()) as { userId?: string }).userId;
        if (bUserId) await removeMemberViaApi(userAContext.request, spaceId, bUserId).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    await deleteSpaceViaApi(userAContext.request, spaceId).catch(() => {});
  });
});
