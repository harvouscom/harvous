/**
 * Offline mode health check — browser QA for the prototype shell.
 *
 * Run: npx playwright test offline-mode-health --workers=1
 * Requires TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD in .env (Clerk dev user with a home space).
 */
import { test as base, expect, type Page } from '@playwright/test';
import { setupClerkTestingToken, clerk } from '@clerk/testing/playwright';
import {
  composeDraftNoteOffline,
  getHomeSpaceId,
  getPersistedUserIdFromPage,
  getSyncChipLabel,
  getSyncQueueSnapshot,
  runOfflineMutationHelper,
  waitForSyncChip,
  waitForSyncChipHidden,
} from './offline-health-helpers';

const HEALTH = {
  basic: { pass: false, notes: '' },
  thread: { pass: false, notes: '' },
  folder: { pass: false, notes: '' },
  race: { pass: false, notes: '' },
  stuck: { pass: false, notes: '' },
  spotcheck: { pass: false, notes: '' },
};

const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await signInWithRetry(page);
    await use(page);
    await page.close();
  },
});

test.describe.configure({ mode: 'serial' });

async function signInWithRetry(page: Page, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto('/');
      await setupClerkTestingToken({ page });
      await clerk.signIn({
        page,
        signInParams: {
          strategy: 'password',
          identifier: process.env.TEST_USER_A_EMAIL!,
          password: process.env.TEST_USER_A_PASSWORD!,
        },
      });
      await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 20_000 });
      await page.waitForTimeout(1500);
      return;
    } catch (err) {
      lastError = err;
      await page.waitForTimeout(1500);
    }
  }
  throw lastError;
}

async function preparePrototypePage(page: Page): Promise<void> {
  if (!page.url().includes('localhost:4322') || page.url().includes('/sign-in')) {
    await page.goto('/');
    await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 20_000 });
  }
  await page.waitForTimeout(1000);
}

test.beforeAll(() => {
  if (!process.env.TEST_USER_A_EMAIL || !process.env.TEST_USER_A_PASSWORD) {
    test.skip(true, 'TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD required');
  }
});

test('1 — basic offline create/edit and chip transitions', async ({ authedPage: page }) => {
  await preparePrototypePage(page);
  const userId = await getPersistedUserIdFromPage(page);
  expect(userId).toBeTruthy();

  await page.context().setOffline(true);
  await composeDraftNoteOffline(page, `Offline health ${Date.now()}`);

  const offlineLabel = await waitForSyncChip(page, /offline|saved on this device/i);
  expect(offlineLabel).toMatch(/offline|saved on this device/i);

  const queued = await getSyncQueueSnapshot(page, userId!);
  expect(queued.some((op) => op.entityType === 'note' && op.operation === 'create')).toBe(true);

  await page.context().setOffline(false);
  await waitForSyncChip(page, /Saving|All caught up/i);
  await waitForSyncChipHidden(page, 30_000);

  const after = await getSyncQueueSnapshot(page, userId!);
  const pending = after.filter((op) => op.retryCount < 5);
  expect(pending.length).toBe(0);

  HEALTH.basic = { pass: true, notes: `Chip: "${offlineLabel}" → drained queue (${queued.length} ops pushed)` };
});

test('2 — offline thread+note create via offline-mutations helper', async ({ authedPage: page }) => {
  await preparePrototypePage(page);
  const userId = await getPersistedUserIdFromPage(page);
  expect(userId).toBeTruthy();
  const spaceId = await getHomeSpaceId(page);

  await page.context().setOffline(true);

  const result = await runOfflineMutationHelper<{ noteId: string; threadId: string }>(
    page,
    `
    const noteId = 'local_health_thread_' + Date.now();
    const threadId = 'local_health_th_' + Date.now();
    const spaceId = '${spaceId}';
    await mod.createThreadOffline(userId, {
      id: threadId,
      title: 'Health check thread',
      spaceId,
    });
    await mod.createNoteOffline(userId, {
      id: noteId,
      title: 'Thread member note',
      content: '<p>offline thread note</p>',
      spaceId,
      threadId,
    });
    return { noteId, threadId };
    `,
  );

  const queued = await getSyncQueueSnapshot(page, userId!);
  const hasNote = queued.some((op) => op.entityType === 'note' && op.operation === 'create');
  const hasLink = queued.some((op) => op.entityType === 'noteThread' && op.operation === 'create');
  expect(hasNote).toBe(true);
  expect(hasLink).toBe(true);

  await page.context().setOffline(false);
  await waitForSyncChipHidden(page, 45_000);

  HEALTH.thread = {
    pass: hasNote && hasLink,
    notes: `Queued note + noteThread for ${result.noteId} / ${result.threadId}`,
  };
});

test('3 — folder move offline queues collection fields', async ({ authedPage: page }) => {
  await preparePrototypePage(page);
  const userId = await getPersistedUserIdFromPage(page);
  expect(userId).toBeTruthy();
  const spaceId = await getHomeSpaceId(page);

  await page.context().setOffline(true);

  const noteId = await runOfflineMutationHelper<string>(
    page,
    `
    const id = 'local_health_folder_' + Date.now();
    await mod.createNoteOffline(userId, {
      id,
      title: 'Folder gap test',
      content: '<p>folder</p>',
      spaceId: '${spaceId}',
    });
    return id;
    `,
  );

    await runOfflineMutationHelper<void>(
      page,
      `
      await mod.updateNoteOffline(userId, '${noteId}', {
        title: 'Folder gap test',
        content: '<p>folder</p>',
        primaryCollection: 'HealthCheckFolder',
        secondaryCollections: [],
        collectionUserOverride: true,
      });
      `,
    );

    const queued = await getSyncQueueSnapshot(page, userId!);
    const noteOp = queued.find((op) => op.entityType === 'note');
    const data = (noteOp?.data ?? {}) as Record<string, unknown>;
    const hasCollection = 'primaryCollection' in data;

    HEALTH.folder = {
      pass: hasCollection,
      notes: hasCollection
        ? 'Collection fields present in queued update'
        : 'Folder fields still missing from offline queue',
    };
    expect(hasCollection).toBe(true);
});

test('4 — delete-before-sync cancels noteThread queue ops', async ({ authedPage: page }) => {
  await preparePrototypePage(page);
  const userId = await getPersistedUserIdFromPage(page);
  expect(userId).toBeTruthy();
  const spaceId = await getHomeSpaceId(page);

  await page.context().setOffline(true);

  await runOfflineMutationHelper<{ noteId: string; threadId: string }>(
    page,
    `
    const noteId = 'local_health_race_' + Date.now();
    const threadId = 'local_health_race_th_' + Date.now();
    const spaceId = '${spaceId}';
    await mod.createThreadOffline(userId, {
      id: threadId,
      title: 'Race thread',
      spaceId,
    });
    await mod.createNoteOffline(userId, {
      id: noteId,
      title: 'Race note',
      content: '<p>race</p>',
      spaceId,
      threadId,
    });
    await mod.deleteNoteOffline(userId, noteId);
    return { noteId, threadId };
    `,
  );

  const queued = await getSyncQueueSnapshot(page, userId!);
  const noteOps = queued.filter((op) => op.entityType === 'note');
  const linkOps = queued.filter((op) => op.entityType === 'noteThread');
  const orphanLink = linkOps.some((op) => op.operation === 'create');

    HEALTH.race = {
      pass: !orphanLink,
      notes: `After delete-before-sync: note ops=${noteOps.length}, noteThread ops=${linkOps.length}, orphan create=${orphanLink}`,
    };
    expect(orphanLink).toBe(false);
});

test('5 — failed sync chip and Retry', async ({ authedPage: page }) => {
  await preparePrototypePage(page);
  const userId = await getPersistedUserIdFromPage(page);
  expect(userId).toBeTruthy();

  await page.evaluate(
    async (uid) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('HarvousOfflineDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        store.add({
          id: `health-fail-${Date.now()}`,
          userId: uid,
          operation: 'update',
          entityType: 'note',
          entityId: 'note_nonexistent_health_check',
          data: { title: 'x', content: '<p>x</p>' },
          timestamp: Date.now(),
          retryCount: 999,
          lastError: 'not_found',
          clientMutationId: `health-fail-${Date.now()}`,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    userId,
  );

  await waitForSyncChip(page, /Couldn't save|cloud/i, 15_000);
  const retry = page.locator('.proto-sync-chip__retry');
  await expect(retry).toBeVisible();

  await page.context().setOffline(false);
  await retry.click();
  await page.waitForTimeout(3000);

  const label = await getSyncChipLabel(page);
  HEALTH.stuck = {
    pass: true,
    notes: `Error chip shown; after Retry label="${label ?? 'hidden'}"`,
  };
});

test('6 — pin and highlight queue offline via offline-mutations helpers', async ({ authedPage: page }) => {
  await preparePrototypePage(page);
  const userId = await getPersistedUserIdFromPage(page);
  expect(userId).toBeTruthy();
  const spaceId = await getHomeSpaceId(page);

  await page.context().setOffline(true);

  // Raw, undecorated fetches (bypassing the app's offline-first mutation hooks) must still
  // fail outright while offline — only `runOfflineFirst`-wrapped hooks queue.
  const rawPinFetchFailed = await page.evaluate(async (sid) => {
    try {
      const res = await fetch(`/api/spaces/${encodeURIComponent(sid)}/pin-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: 'note_1', itemType: 'note', isPinned: true }),
      });
      return !res.ok;
    } catch {
      return true;
    }
  }, spaceId);
  expect(rawPinFetchFailed).toBe(true);

  const noteId = await runOfflineMutationHelper<string>(
    page,
    `
    const id = 'local_health_pin_' + Date.now();
    await mod.createNoteOffline(userId, {
      id,
      title: 'Pin health check',
      content: '<p>pin me</p>',
      spaceId: '${spaceId}',
    });
    return id;
    `,
  );

  await runOfflineMutationHelper<void>(
    page,
    `
    await mod.pinNoteOffline(userId, '${noteId}', true, {
      content: '<p>pin me</p>',
      title: 'Pin health check',
      spaceId: '${spaceId}',
    });
    `,
  );

  const entryId = await runOfflineMutationHelper<string>(
    page,
    `
    return mod.createStudyThreadEntryOffline(userId, {
      parentNoteId: '${noteId}',
      entryKind: 'miniNote',
      focusTitle: 'Health check highlight',
    });
    `,
  );

  const queued = await getSyncQueueSnapshot(page, userId!);
  const pinOp = queued.find(
    (op) =>
      op.entityType === 'note' &&
      op.operation === 'update' &&
      (op.data as Record<string, unknown> | undefined)?.isPinned === true,
  );
  const highlightOp = queued.find(
    (op) => op.entityType === 'studyThreadEntry' && op.operation === 'create' && op.entityId === entryId,
  );

  HEALTH.spotcheck = {
    pass: !!pinOp && !!highlightOp,
    notes: `Offline hooks queue: pin op=${!!pinOp}, highlight op=${!!highlightOp} (raw fetch still fails offline as expected)`,
  };
  expect(pinOp).toBeTruthy();
  expect(highlightOp).toBeTruthy();

  await page.context().setOffline(false);
  await waitForSyncChipHidden(page, 45_000);
});

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log('\n=== OFFLINE HEALTH CHECK RESULTS ===\n', JSON.stringify(HEALTH, null, 2));
});
