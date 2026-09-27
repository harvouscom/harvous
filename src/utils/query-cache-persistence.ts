/**
 * The React Query cache, kept between visits so opening the app paints what was there last time.
 *
 * **Why this exists.** A reload used to start from nothing. Home waits for Clerk to load, for a
 * session JWT, and then for ~20 queries — measured at 2.9s from navigation on a warm reload
 * (docs/performance/PERF_BASELINE.md, "Opening the app"). None of that wait was the reader's
 * data changing; it was the app re-learning what it already knew a minute ago. This keeps the
 * last-known answers in IndexedDB, restores them before the first render, and lets every query
 * revalidate underneath once auth is ready — the way a document app opens.
 *
 * **Whose cache it is.** A snapshot belongs to one Clerk user. Before Clerk loads, the only
 * evidence of who is signed in is the `__session` cookie's JWT `sub`, so restore requires that
 * to match (falling back to the `harvous-user-id` hint only when the cookie carries no readable
 * id). Once Clerk answers, `reconcilePersistedQueryCacheUser` either confirms the guess or
 * resets every query and deletes the snapshot. Signed out, the snapshot is deleted — see
 * `clearUserClientStorageCaches`.
 *
 * **Which build wrote it.** A snapshot from a different build is discarded, never read. Response
 * shapes change between deploys (`sample.cloze` → `sample.exercise.cloze` crashed Home once from
 * exactly this kind of skew, see build-freshness.ts), and cached data is rendered before the
 * first refetch can correct it. The cost is one uncached load per deploy.
 *
 * **What it does not do.** It is not the offline read mirror (`offline-db.ts`), which the
 * prototype must never bootstrap. It holds only what React Query already held in memory, capped,
 * and only queries that succeeded.
 *
 * The read is started by an inline script in `spa/index.html` so it overlaps the bundle download
 * rather than following it; the names below must match that script (a test checks).
 */
import { dehydrate, hydrate, type DehydratedState, type QueryClient, type Query } from '@tanstack/react-query';

declare const __BUILD_ID__: string | undefined;
declare const __APP_VERSION__: string | undefined;

export const QUERY_CACHE_DB_NAME = 'harvous-query-cache';
export const QUERY_CACHE_STORE = 'snapshots';
export const QUERY_CACHE_KEY = 'last';
/** Where the inline boot script parks its read. */
export const QUERY_CACHE_BOOT_READ_GLOBAL = '__harvousQueryCacheRead';

/** Older than this and last-known is no longer a fair stand-in for current. */
export const QUERY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Most recently updated queries kept. Everything Home, the shell and the Library panel render
 * from is well under this; the cap is for a long session that opened many notes.
 */
export const QUERY_CACHE_MAX_QUERIES = 200;
/** How long first render may wait for the read. The boot script starts it long before this. */
const RESTORE_WAIT_MS = 250;
const SAVE_DEBOUNCE_MS = 1_500;

/**
 * Query-key roots never written to disk: admin views (another person's data, and useless on a
 * cold start) and live search results (keyed per keystroke, stale by definition).
 */
const NEVER_PERSISTED_ROOTS = new Set(['admin', 'harvous-admin-check', 'search', 'sermonNoteSearch']);

export interface PersistedQueryCacheSnapshot {
  userId: string;
  buster: string;
  savedAt: number;
  state: DehydratedState;
}

export function queryCacheBuster(): string {
  const version = typeof __APP_VERSION__ === 'undefined' ? '' : __APP_VERSION__;
  const build = typeof __BUILD_ID__ === 'undefined' ? '' : __BUILD_ID__;
  return `${version}:${build}`;
}

/* ── IndexedDB ─────────────────────────────────────────────────────────────── */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUERY_CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(QUERY_CACHE_STORE)) {
        req.result.createObjectStore(QUERY_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(QUERY_CACHE_STORE, mode);
      const req = run(tx.objectStore(QUERY_CACHE_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function readSnapshotFromDb(): Promise<unknown> {
  return withStore('readonly', (store) => store.get(QUERY_CACHE_KEY));
}

export async function deletePersistedQueryCache(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await withStore('readwrite', (store) => store.delete(QUERY_CACHE_KEY));
  } catch {
    /* blocked site data / private mode: nothing was stored either */
  }
}

async function writeSnapshot(snapshot: PersistedQueryCacheSnapshot): Promise<void> {
  await withStore('readwrite', (store) => store.put(snapshot, QUERY_CACHE_KEY));
}

/* ── Who is signed in, before Clerk can say ────────────────────────────────── */

function decodeJwtSub(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

/**
 * The Clerk user id this browser's cookies point at, or null when they point at nobody.
 *
 * `__client_uat=0` (or absent) is Clerk saying "signed out", and wins over everything. Otherwise
 * the `__session` JWT names the user — expired tokens included, since only the `sub` is read and
 * nothing is authorised by it. Development instances suffix the cookie names, hence the pattern.
 */
export function readSessionUserIdHint(cookie: string, storedUserId: string | null): string | null {
  const uat = /(?:^|;\s*)__client_uat(?:_[A-Za-z0-9]+)?=(\d+)/.exec(cookie);
  if (!uat || uat[1] === '0') return null;
  const session = /(?:^|;\s*)__session(?:_[A-Za-z0-9]+)?=([^;]+)/.exec(cookie);
  const sub = session ? decodeJwtSub(decodeURIComponent(session[1])) : null;
  return sub ?? storedUserId;
}

function currentSessionUserIdHint(): string | null {
  if (typeof document === 'undefined') return null;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('harvous-user-id');
  } catch {
    /* ignore */
  }
  return readSessionUserIdHint(document.cookie, stored);
}

/* ── Restore ───────────────────────────────────────────────────────────────── */

let restoredUserId: string | null = null;

/** True when this document's first render was painted from a restored snapshot. */
export function wasQueryCacheRestored(): boolean {
  return restoredUserId !== null;
}

function isSnapshot(value: unknown): value is PersistedQueryCacheSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PersistedQueryCacheSnapshot>;
  return (
    typeof v.userId === 'string' &&
    typeof v.buster === 'string' &&
    typeof v.savedAt === 'number' &&
    Boolean(v.state && Array.isArray(v.state.queries))
  );
}

/** Why a snapshot is not used, or null when it is. Pure, for the tests. */
export function snapshotRejection(
  value: unknown,
  opts: { buster: string; now: number; sessionUserId: string | null; guest: boolean },
): 'missing' | 'malformed' | 'build' | 'expired' | 'signed-out' | 'guest' | 'other-user' | null {
  if (value == null) return 'missing';
  if (!isSnapshot(value)) return 'malformed';
  if (value.buster !== opts.buster) return 'build';
  if (opts.now - value.savedAt > QUERY_CACHE_MAX_AGE_MS) return 'expired';
  if (opts.guest) return 'guest';
  if (!opts.sessionUserId) return 'signed-out';
  if (opts.sessionUserId !== value.userId) return 'other-user';
  return null;
}

function bootRead(): Promise<unknown> {
  const w = window as unknown as Record<string, Promise<unknown> | undefined>;
  const started = w[QUERY_CACHE_BOOT_READ_GLOBAL];
  delete w[QUERY_CACHE_BOOT_READ_GLOBAL];
  return started ?? readSnapshotFromDb();
}

/**
 * Hydrate `client` from the last snapshot when it belongs to whoever the cookies say is signed in.
 * Resolves within `RESTORE_WAIT_MS` whatever happens; a late read is simply not used.
 */
export async function restorePersistedQueryCache(
  client: QueryClient,
  opts: { guest: boolean },
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return false;
  const sessionUserId = currentSessionUserIdHint();
  // Nobody to restore for. Not deleted here: Clerk has not confirmed it yet, and the signed-out
  // cleanup (`clearUserClientStorageCaches`) deletes it once it has.
  if (!sessionUserId || opts.guest) return false;
  let value: unknown;
  try {
    value = await Promise.race([
      bootRead(),
      new Promise((resolve) => window.setTimeout(() => resolve(undefined), RESTORE_WAIT_MS)),
    ]);
  } catch {
    return false;
  }
  const rejection = snapshotRejection(value, {
    buster: queryCacheBuster(),
    now: Date.now(),
    sessionUserId,
    guest: opts.guest,
  });
  if (rejection) {
    // Keep a snapshot only when it might still be someone's next load: nothing to delete, or a
    // read that simply lost the race. Everything else is dead weight or someone else's data.
    if (rejection !== 'missing' && value !== undefined) void deletePersistedQueryCache();
    return false;
  }
  const snapshot = value as PersistedQueryCacheSnapshot;
  hydrate(client, snapshot.state);
  restoredUserId = snapshot.userId;
  return true;
}

/**
 * Once Clerk has answered: if the cookies guessed wrong about who this is, nothing restored may
 * stay on screen. `resetQueries` (not `clear`) so mounted observers refetch rather than holding
 * references to queries that were removed underneath them.
 */
export function reconcilePersistedQueryCacheUser(client: QueryClient, clerkUserId: string | null): void {
  if (restoredUserId === null || restoredUserId === clerkUserId) return;
  restoredUserId = null;
  void deletePersistedQueryCache();
  void client.resetQueries();
}

/* ── Save ──────────────────────────────────────────────────────────────────── */

export function isPersistableQuery(query: Pick<Query, 'queryKey' | 'state' | 'meta'>): boolean {
  if (query.state.status !== 'success' || query.state.data === undefined) return false;
  if (query.meta?.persist === false) return false;
  const root = query.queryKey[0];
  return !(typeof root === 'string' && NEVER_PERSISTED_ROOTS.has(root));
}

/** The snapshot to write: persistable queries only, newest `QUERY_CACHE_MAX_QUERIES` of them. */
export function buildQueryCacheSnapshot(
  client: QueryClient,
  userId: string,
  now: number,
): PersistedQueryCacheSnapshot {
  const state = dehydrate(client, {
    shouldDehydrateQuery: isPersistableQuery,
    shouldDehydrateMutation: () => false,
  });
  const queries = [...state.queries]
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)
    .slice(0, QUERY_CACHE_MAX_QUERIES);
  return { userId, buster: queryCacheBuster(), savedAt: now, state: { queries, mutations: [] } };
}

/**
 * Keep the snapshot current while `getUserId` names a signed-in account. Saves on a debounce after
 * any query succeeds, and immediately when the page is hidden — the last moment a PWA is
 * guaranteed to run before iOS suspends it. Returns the unsubscribe.
 */
export function startQueryCachePersistence(client: QueryClient, getUserId: () => string | null): () => void {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return () => {};
  let timer: number | null = null;
  let dirty = false;
  let failedOnce = false;

  const save = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    const userId = getUserId();
    if (!dirty || !userId) return;
    dirty = false;
    writeSnapshot(buildQueryCacheSnapshot(client, userId, Date.now())).catch((err: unknown) => {
      // A DataCloneError names a query holding something IndexedDB cannot store (a function, a
      // class instance with private state). Say so once; the app works without the snapshot.
      if (!failedOnce) {
        failedOnce = true;
        console.warn('[query-cache] snapshot not saved', err);
      }
    });
  };

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    dirty = true;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(save, SAVE_DEBOUNCE_MS);
  });
  const onHidden = () => {
    if (document.visibilityState === 'hidden') save();
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', save);

  return () => {
    unsubscribe();
    if (timer !== null) window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', save);
  };
}
