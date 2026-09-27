import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Real IndexedDB (fake-indexeddb, from the shared setup) rather than a stub: the restore path is
 * mostly storage plumbing, and the inline boot script in index.html must agree with it on names.
 * Fresh module per test because "was this document restored" is module state, like the page's.
 */
async function load() {
  vi.resetModules();
  return import('../query-cache-persistence');
}

function jwt(sub: string): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'RS256' })}.${b64({ sub })}.sig`;
}

function setCookies(...cookies: string[]) {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
  for (const c of cookies) document.cookie = `${c}; path=/`;
}

function signedInAs(userId: string) {
  setCookies('__client_uat=1758900000', `__session=${jwt(userId)}`);
}

async function waitFor<T>(read: () => Promise<T>, done: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const v = await read();
    if (done(v)) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out');
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, gcTime: 30 * 60_000 } } });
}

/** Write a snapshot the way a signed-in session would: populate, then save on page hide. */
async function saveAs(userId: string, fill: (c: QueryClient) => void) {
  const mod = await load();
  const client = newClient();
  const stop = mod.startQueryCachePersistence(client, () => userId);
  fill(client);
  window.dispatchEvent(new Event('pagehide'));
  stop();
  return mod;
}

beforeEach(async () => {
  const { deletePersistedQueryCache } = await load();
  await deletePersistedQueryCache();
  delete (window as unknown as Record<string, unknown>).__harvousQueryCacheRead;
  localStorage.clear();
  setCookies();
});

afterEach(() => {
  setCookies();
});

describe('readSessionUserIdHint', () => {
  it('reads the user from the session JWT', async () => {
    const { readSessionUserIdHint } = await load();
    expect(readSessionUserIdHint(`__client_uat=17; __session=${jwt('user_a')}`, null)).toBe('user_a');
  });

  it('accepts the suffixed cookie names Clerk development instances use', async () => {
    const { readSessionUserIdHint } = await load();
    expect(readSessionUserIdHint(`__client_uat_ab12=17; __session_ab12=${jwt('user_a')}`, null)).toBe('user_a');
  });

  it('is nobody when Clerk says signed out, whatever else is lying around', async () => {
    const { readSessionUserIdHint } = await load();
    expect(readSessionUserIdHint(`__client_uat=0; __session=${jwt('user_a')}`, 'user_a')).toBeNull();
    expect(readSessionUserIdHint(`__session=${jwt('user_a')}`, 'user_a')).toBeNull();
  });

  it('falls back to the stored id only when the session carries none', async () => {
    const { readSessionUserIdHint } = await load();
    expect(readSessionUserIdHint('__client_uat=17', 'user_b')).toBe('user_b');
    expect(readSessionUserIdHint(`__client_uat=17; __session=${jwt('user_a')}`, 'user_b')).toBe('user_a');
  });
});

describe('snapshotRejection', () => {
  const base = { buster: 'v:1', now: 1_000_000, sessionUserId: 'user_a', guest: false };
  const snap = { userId: 'user_a', buster: 'v:1', savedAt: 999_000, state: { queries: [], mutations: [] } };

  it('accepts a fresh snapshot for the signed-in user from this build', async () => {
    const { snapshotRejection } = await load();
    expect(snapshotRejection(snap, base)).toBeNull();
  });

  it('rejects another build, another user, a guest, an old snapshot and junk', async () => {
    const { snapshotRejection, QUERY_CACHE_MAX_AGE_MS } = await load();
    expect(snapshotRejection(snap, { ...base, buster: 'v:2' })).toBe('build');
    expect(snapshotRejection(snap, { ...base, sessionUserId: 'user_b' })).toBe('other-user');
    expect(snapshotRejection(snap, { ...base, sessionUserId: null })).toBe('signed-out');
    expect(snapshotRejection(snap, { ...base, guest: true })).toBe('guest');
    expect(snapshotRejection(snap, { ...base, now: snap.savedAt + QUERY_CACHE_MAX_AGE_MS + 1 })).toBe('expired');
    expect(snapshotRejection({ userId: 'user_a' }, base)).toBe('malformed');
    expect(snapshotRejection(undefined, base)).toBe('missing');
  });
});

describe('buildQueryCacheSnapshot', () => {
  it('keeps successful queries only, and never admin or live search', async () => {
    const { buildQueryCacheSnapshot } = await load();
    const client = newClient();
    client.setQueryData(['profile'], { firstName: 'Ada' });
    client.setQueryData(['admin', 'users'], [{ id: 'someone-else' }]);
    client.setQueryData(['search', 'grace'], []);
    client.getQueryCache().build(client, { queryKey: ['never-fetched'] });

    const keys = buildQueryCacheSnapshot(client, 'user_a', 1).state.queries.map((q) => q.queryKey[0]);
    expect(keys).toEqual(['profile']);
  });

  it('honours meta.persist === false', async () => {
    const { buildQueryCacheSnapshot } = await load();
    const client = newClient();
    client.getQueryCache().build(client, { queryKey: ['secret'], meta: { persist: false } }).setData({ x: 1 });
    expect(buildQueryCacheSnapshot(client, 'user_a', 1).state.queries).toHaveLength(0);
  });

  it('caps at the newest QUERY_CACHE_MAX_QUERIES', async () => {
    const { buildQueryCacheSnapshot, QUERY_CACHE_MAX_QUERIES } = await load();
    const client = newClient();
    for (let i = 0; i < QUERY_CACHE_MAX_QUERIES + 5; i++) {
      client.setQueryData(['note', i], { i }, { updatedAt: i + 1 });
    }
    const queries = buildQueryCacheSnapshot(client, 'user_a', 1).state.queries;
    expect(queries).toHaveLength(QUERY_CACHE_MAX_QUERIES);
    expect(queries.some((q) => q.queryKey[1] === 0)).toBe(false);
    expect(queries[0].queryKey[1]).toBe(QUERY_CACHE_MAX_QUERIES + 4);
  });
});

describe('save and restore', () => {
  it('restores the signed-in user’s last cache into a fresh client, stale so it revalidates', async () => {
    await saveAs('user_a', (c) => c.setQueryData(['profile'], { firstName: 'Ada' }, { updatedAt: 1 }));
    signedInAs('user_a');

    // The save is async and fire-and-forget; wait for it to land rather than guessing a delay.
    await waitFor(
      async () => (await load()).restorePersistedQueryCache(newClient(), { guest: false }),
      Boolean,
    );
    const mod = await load();
    const client = newClient();
    expect(await mod.restorePersistedQueryCache(client, { guest: false })).toBe(true);
    expect(mod.wasQueryCacheRestored()).toBe(true);
    expect(client.getQueryData(['profile'])).toEqual({ firstName: 'Ada' });
    expect(client.getQueryState(['profile'])?.fetchStatus).toBe('idle');
    expect(client.getQueryState(['profile'])?.dataUpdatedAt).toBe(1);
  });

  it('does not restore another account’s cache, and deletes it', async () => {
    await saveAs('user_a', (c) => c.setQueryData(['profile'], { firstName: 'Ada' }));
    // Prove it landed first, so the refusals below are refusals and not an empty store.
    signedInAs('user_a');
    await waitFor(
      async () => (await load()).restorePersistedQueryCache(newClient(), { guest: false }),
      Boolean,
    );

    signedInAs('user_b');
    const client = newClient();
    expect(await (await load()).restorePersistedQueryCache(client, { guest: false })).toBe(false);
    expect(client.getQueryData(['profile'])).toBeUndefined();

    // And it is gone, not merely skipped: user_a's next load starts cold.
    signedInAs('user_a');
    await waitFor(
      async () => (await load()).restorePersistedQueryCache(newClient(), { guest: false }),
      (restored) => !restored,
    );
  });

  it('never reads for a signed-out browser or a guest', async () => {
    await saveAs('user_a', (c) => c.setQueryData(['profile'], { firstName: 'Ada' }));
    await new Promise((r) => setTimeout(r, 50));

    setCookies('__client_uat=0');
    expect(await (await load()).restorePersistedQueryCache(newClient(), { guest: false })).toBe(false);

    signedInAs('user_a');
    expect(await (await load()).restorePersistedQueryCache(newClient(), { guest: true })).toBe(false);
  });

  it('does not save while no account is signed in', async () => {
    const mod = await load();
    const client = newClient();
    const stop = mod.startQueryCachePersistence(client, () => null);
    client.setQueryData(['profile'], { firstName: 'Guest' });
    window.dispatchEvent(new Event('pagehide'));
    stop();
    await new Promise((r) => setTimeout(r, 50));

    signedInAs('user_a');
    expect(await (await load()).restorePersistedQueryCache(newClient(), { guest: false })).toBe(false);
  });

  it('uses the read index.html started instead of opening its own', async () => {
    signedInAs('user_a');
    const { queryCacheBuster, QUERY_CACHE_BOOT_READ_GLOBAL, restorePersistedQueryCache } = await load();
    (window as unknown as Record<string, unknown>)[QUERY_CACHE_BOOT_READ_GLOBAL] = Promise.resolve({
      userId: 'user_a',
      buster: queryCacheBuster(),
      savedAt: Date.now(),
      state: {
        queries: [
          {
            queryKey: ['profile'],
            queryHash: '["profile"]',
            state: { data: { firstName: 'Boot' }, dataUpdatedAt: 5, status: 'success', fetchStatus: 'idle' },
          },
        ],
        mutations: [],
      },
    });
    const client = newClient();
    expect(await restorePersistedQueryCache(client, { guest: false })).toBe(true);
    expect(client.getQueryData(['profile'])).toEqual({ firstName: 'Boot' });
  });
});

describe('reconcilePersistedQueryCacheUser', () => {
  it('resets everything restored when Clerk names someone else', async () => {
    signedInAs('user_a');
    const mod = await load();
    (window as unknown as Record<string, unknown>)[mod.QUERY_CACHE_BOOT_READ_GLOBAL] = Promise.resolve({
      userId: 'user_a',
      buster: mod.queryCacheBuster(),
      savedAt: Date.now(),
      state: {
        queries: [
          {
            queryKey: ['profile'],
            queryHash: '["profile"]',
            state: { data: { firstName: 'Ada' }, dataUpdatedAt: 5, status: 'success', fetchStatus: 'idle' },
          },
        ],
        mutations: [],
      },
    });
    const client = newClient();
    await mod.restorePersistedQueryCache(client, { guest: false });

    mod.reconcilePersistedQueryCacheUser(client, 'user_a');
    expect(client.getQueryData(['profile'])).toEqual({ firstName: 'Ada' });

    mod.reconcilePersistedQueryCacheUser(client, 'user_b');
    expect(client.getQueryData(['profile'])).toBeUndefined();
    expect(mod.wasQueryCacheRestored()).toBe(false);
  });
});

/*
 * The boot read in index.html is a copy of these names in plain script, because it has to run
 * before the bundle exists. If either side is renamed alone, restore silently falls back to a
 * second read after the bundle — correct, and slower, and invisible without this.
 */
describe('index.html boot read', () => {
  it('uses the same database, store, key and global as the module', async () => {
    const mod = await load();
    const html = readFileSync(path.resolve(__dirname, '../../../spa/index.html'), 'utf8');
    expect(html).toContain(`indexedDB.open('${mod.QUERY_CACHE_DB_NAME}', 1)`);
    expect(html).toContain(`createObjectStore('${mod.QUERY_CACHE_STORE}')`);
    expect(html).toContain(`objectStore('${mod.QUERY_CACHE_STORE}').get('${mod.QUERY_CACHE_KEY}')`);
    expect(html).toContain(`window.${mod.QUERY_CACHE_BOOT_READ_GLOBAL} =`);
  });
});
