/**
 * In-process cache for the heavy admin Pulse / Usage payloads.
 *
 * Netlify Functions were a new isolate per request, so remembering work was
 * pointless. Fly is one process: the first computation can fill the cache, and
 * every admin tab after that is a memory read. In-flight coalescing matters as
 * much as the TTL — React Query retries a hung Pulse as a second identical
 * blast, and without this those retries stacked on the same 10-connection pool.
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const ADMIN_DASHBOARD_TTL_MS = 60 * 1000;

export async function cachedAdminDashboard<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = ADMIN_DASHBOARD_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  if (hit) {
    const refresh = load()
      .then((value) => {
        store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, refresh);
    return hit.value;
  }

  const promise = load()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/** Test hook — production callers never need this. */
export function clearAdminDashboardCache() {
  store.clear();
  inflight.clear();
}
