import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Absolute path — under the worktree/repo you run Playwright from, not the main monorepo root. */
export const SCREENSHOT_DIR = resolve(process.cwd(), 'test-results', 'shared-spaces-screenshots');

const screenshotPaths: string[] = [];

let snapIndex = 0;

export function resetScreenshotIndex() {
  snapIndex = 0;
  screenshotPaths.length = 0;
}

export function logScreenshotDir() {
  ensureScreenshotDir();
  // eslint-disable-next-line no-console
  console.log(`\n📸 Screenshots folder (absolute path):\n   ${SCREENSHOT_DIR}\n`);
}

export function writeScreenshotManifest() {
  if (screenshotPaths.length === 0) return;
  const manifest = join(SCREENSHOT_DIR, 'README.txt');
  writeFileSync(
    manifest,
    `Shared Spaces UI screenshot tour\nGenerated: ${new Date().toISOString()}\nFolder: ${SCREENSHOT_DIR}\n\n${screenshotPaths.map((p, i) => `${String(i + 1).padStart(2, '0')}. ${p}`).join('\n')}\n`,
  );
}

export function ensureScreenshotDir() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/** Ordered PNG captures for design review (01-addon-page.png, …). */
export async function snap(page: Page, slug: string, opts?: { fullPage?: boolean }) {
  ensureScreenshotDir();
  snapIndex += 1;
  const padded = String(snapIndex).padStart(2, '0');
  const safe = slug.replace(/[^a-z0-9-]+/gi, '-').replace(/-+/g, '-').toLowerCase();
  const filePath = join(SCREENSHOT_DIR, `${padded}-${safe}.png`);
  await page.screenshot({
    path: filePath,
    fullPage: opts?.fullPage ?? true,
  });
  screenshotPaths.push(filePath);
  // eslint-disable-next-line no-console
  console.log(`  📷 ${filePath}`);
}

/** Prototype autosave debounces ~700ms then PUTs /api/notes/update. */
export async function focusNoteBodyEditor(page: Page) {
  const body = page.locator('main .ProseMirror').first();
  await body.waitFor({ state: 'visible', timeout: 15_000 });
  await body.click();
  return body;
}

export async function typeInNoteBodyAndWaitForSave(page: Page, text: string) {
  const body = await focusNoteBodyEditor(page);
  // A brand-new draft first persists via POST /api/notes/create; later edits PUT
  // /api/notes/update. Accept either so composing a fresh note doesn't stall.
  const saveWait = page.waitForResponse(
    (r) => /\/api\/notes\/(create|update)/.test(r.url()) && r.ok(),
    { timeout: 15_000 },
  );
  await body.pressSequentially(text, { delay: 15 });
  await expect(body).toContainText(text, { timeout: 5_000 });
  try {
    await saveWait;
  } catch {
    // Fallback if debounce is slow or save already completed
    await page.waitForTimeout(1200);
  }
}

/** Shared-space list rows show date titles; match by body preview text instead. */
export function sharedSpaceNoteRow(page: Page, previewOrTitle: string) {
  return page.locator('.proto-note-list button').filter({ hasText: previewOrTitle });
}

export function requireSharedSpacesEnv() {
  const keys = [
    'TEST_USER_A_EMAIL',
    'TEST_USER_B_EMAIL',
    'CLERK_SECRET_KEY',
    'PUBLIC_CLERK_PUBLISHABLE_KEY',
  ] as const;
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing env for shared-spaces e2e: ${missing.join(', ')}`);
  }
}

export async function grantSharedSpacesAddon(request: APIRequestContext, enabled = true) {
  const res = await request.post('/api/test/set-shared-spaces-addon', {
    data: { enabled },
  });
  if (!res.ok()) {
    throw new Error(`set-shared-spaces-addon failed: ${res.status()} ${await res.text()}`);
  }
}

export async function createSharedSpaceViaApi(
  request: APIRequestContext,
  title: string,
  color = 'purple',
): Promise<{ id: string; title: string }> {
  const res = await request.post('/api/spaces/create-shared', {
    data: { title, color },
  });
  const json = (await res.json()) as { space?: { id: string; title: string }; error?: string };
  if (!res.ok()) {
    throw new Error(`create-shared failed: ${JSON.stringify(json)}`);
  }
  if (!json.space?.id) throw new Error('create-shared returned no space');
  return json.space;
}

export async function createInviteViaApi(
  request: APIRequestContext,
  spaceId: string,
): Promise<{ inviteUrl: string; token: string; inviteId: string }> {
  const sid = spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
  const res = await request.post(`/api/spaces/${sid}/invites`, { data: {} });
  const json = (await res.json()) as { inviteUrl?: string; inviteId?: string; error?: string };
  if (!res.ok() || !json.inviteUrl || !json.inviteId) {
    throw new Error(`create invite failed: ${JSON.stringify(json)}`);
  }
  const token = json.inviteUrl.split('/spaces/join/')[1]?.split('?')[0] ?? '';
  if (!token) throw new Error(`could not parse token from ${json.inviteUrl}`);
  return { inviteUrl: json.inviteUrl, token, inviteId: json.inviteId };
}

export async function createNoteInSpaceViaApi(
  request: APIRequestContext,
  spaceId: string,
  content: string,
  title = 'E2E note',
): Promise<string> {
  const sid = spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
  const res = await request.post('/api/notes/create', {
    data: {
      spaceId: sid,
      title,
      content: `<p>${content}</p>`,
      noteType: 'default',
    },
  });
  const json = (await res.json()) as { note?: { id: string }; error?: string };
  if (!res.ok() || !json.note?.id) {
    throw new Error(`create note failed: ${JSON.stringify(json)}`);
  }
  return json.note.id;
}

export async function removeMemberViaApi(request: APIRequestContext, spaceId: string, userId: string) {
  const sid = spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
  const res = await request.delete(`/api/spaces/${sid}/members/${userId}`);
  if (!res.ok()) {
    throw new Error(`remove member failed: ${res.status()} ${await res.text()}`);
  }
}

export async function deleteSpaceViaApi(request: APIRequestContext, spaceId: string) {
  const sid = spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
  const res = await request.delete(`/api/spaces/delete?spaceId=${encodeURIComponent(sid)}`);
  if (!res.ok()) {
    throw new Error(`delete space failed: ${res.status()} ${await res.text()}`);
  }
}

/** Space switcher orb — first tap on list layer only switches layer; second opens menu. */
export async function openSpaceSwitcherMenu(page: Page) {
  const trigger = page.locator('.proto-sidebar-toolbar__mode-menu button[aria-haspopup="menu"]').first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Spaces' });
  if (!(await menu.isVisible().catch(() => false))) {
    await trigger.click();
  }
  await expect(menu).toBeVisible({ timeout: 8_000 });
}

export async function selectSpaceInSwitcher(page: Page, spaceTitle: string) {
  await openSpaceSwitcherMenu(page);
  await page.getByRole('menuitemradio', { name: spaceTitle }).click();
  await expect(page.getByRole('menu', { name: 'Spaces' })).toBeHidden({ timeout: 5_000 });
}

export async function openPeopleSheet(page: Page) {
  const peopleBtn = page.getByRole('button', { name: /people|invite/i }).first();
  await expect(peopleBtn).toBeVisible({ timeout: 10_000 });
  await peopleBtn.click();
  await expect(page.getByRole('dialog', { name: /people in/i })).toBeVisible({ timeout: 8_000 });
}

/**
 * The owner "Manage space" sheet is a hub → sub-views model (People / Invite links /
 * Space settings). From the hub, drill into a section; the header title becomes the
 * section name. Scoped to the sheet dialog so it never collides with the sidebar
 * trigger or a confirm dialog.
 */
export async function openManageSubView(
  page: Page,
  label: 'People' | 'Invite links' | 'Space settings',
) {
  const sheet = page.getByRole('dialog', { name: /people in/i });
  await sheet.getByRole('button', { name: new RegExp(`^${label}`) }).first().click();
  await expect(sheet.locator('.proto-study-thread-popover__title')).toHaveText(label, {
    timeout: 8_000,
  });
}

export async function waitForAppShell(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('.proto-sidebar-root, .proto-sidebar-toolbar').first().waitFor({ timeout: 20_000 });
}

export async function getPersonalHomeSpaceId(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/navigation/data');
  if (!res.ok()) throw new Error(`navigation/data failed: ${res.status()}`);
  const json = (await res.json()) as { spaces?: Array<{ id: string; type?: string; title?: string }> };
  const personal = json.spaces?.find((s) => s.type === 'personal') ?? json.spaces?.[0];
  if (!personal?.id) throw new Error('No personal home space in navigation data');
  return personal.id;
}
