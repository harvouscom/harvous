import { type Page, expect } from '@playwright/test';

export type SyncQueueOpSnapshot = {
  entityType: string;
  operation: string;
  entityId: string;
  retryCount: number;
  data?: unknown;
};

/** Read pending sync-queue ops for a user from HarvousOfflineDB. */
export async function getSyncQueueSnapshot(page: Page, userId: string): Promise<SyncQueueOpSnapshot[]> {
  return page.evaluate(async (uid) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('HarvousOfflineDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const ops = await new Promise<SyncQueueOpSnapshot[]>((resolve, reject) => {
        const tx = db.transaction('syncQueue', 'readonly');
        const store = tx.objectStore('syncQueue');
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = (req.result as (SyncQueueOpSnapshot & { userId?: string })[]).filter(
            (op) => op.userId === uid,
          );
          resolve(
            rows.map((op: SyncQueueOpSnapshot & { data?: unknown }) => ({
              entityType: op.entityType,
              operation: op.operation,
              entityId: op.entityId,
              retryCount: op.retryCount,
              data: op.data,
            })),
          );
        };
        req.onerror = () => reject(req.error);
      });
      return ops;
    } finally {
      db.close();
    }
  }, userId);
}

export async function getSyncChipLabel(page: Page): Promise<string | null> {
  const chip = page.locator('.proto-sync-chip__label');
  if ((await chip.count()) === 0) return null;
  return chip.textContent();
}

export async function waitForSyncChip(page: Page, pattern: RegExp, timeout = 20_000): Promise<string> {
  const label = page.locator('.proto-sync-chip__label');
  await expect(label).toHaveText(pattern, { timeout });
  return (await label.textContent()) ?? '';
}

export async function waitForSyncChipHidden(page: Page, timeout = 20_000): Promise<void> {
  await expect(page.locator('.proto-sync-chip')).toHaveCount(0, { timeout });
}

export async function getPersistedUserIdFromPage(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as { __harvous_userId?: string }).__harvous_userId ?? null);
}

/** Invoke offline-mutations helpers through Vite dev module graph (same @ alias as the app). */
export async function runOfflineMutationHelper<T>(page: Page, fnBody: string): Promise<T> {
  return page.evaluate(async (body) => {
    const mod = await import('@/utils/offline-mutations');
    const userId = (window as { __harvous_userId?: string }).__harvous_userId;
    if (!userId) throw new Error('No persisted userId on window');
    // eslint-disable-next-line no-new-func
    const fn = new Function('mod', 'userId', `return (async () => { ${body} })()`);
    return fn(mod, userId);
  }, fnBody);
}

export async function getHomeSpaceId(page: Page): Promise<string> {
  const fromApi = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/user/get-profile');
      if (!res.ok) return null;
      const data = (await res.json()) as { homeSpaceId?: string; defaultSpaceId?: string };
      return data.homeSpaceId ?? data.defaultSpaceId ?? null;
    } catch {
      return null;
    }
  });
  if (fromApi) return fromApi.startsWith('space_') ? fromApi : `space_${fromApi}`;
  throw new Error('Could not resolve home space id from /api/user/get-profile');
}

export async function composeDraftNoteOffline(page: Page, title: string): Promise<void> {
  await page.goto('/n/new');
  await page.waitForURL(/\/n\/new/, { timeout: 15_000 });
  const editor = page.locator('.ProseMirror').first();
  await editor.waitFor({ state: 'visible', timeout: 15_000 });
  await editor.click();
  await page.keyboard.type(title);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(2000);
}
