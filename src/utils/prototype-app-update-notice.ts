export const PROTO_APP_UPDATE_EVENT = 'harvous-prototype-app-update';

export type PrototypeAppUpdateMode = 'info' | 'reload';

export function showPrototypeAppUpdateNotice(mode: PrototypeAppUpdateMode = 'info'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROTO_APP_UPDATE_EVENT, { detail: { mode } }));
}

/**
 * Drop every Cache Storage entry, then run `done`.
 *
 * Reloading alone is not enough after a deploy: the SW answers `/` from cache
 * (stale-while-revalidate), so the retry gets the same stale index.html pointing at chunk
 * URLs Netlify has already deleted — and a poisoned `/assets/*.js` entry would be served
 * from cache regardless. Always calls `done`, even if the cache API throws.
 */
export function clearAppCachesThen(done: () => void): void {
  if (typeof caches === 'undefined') {
    done();
    return;
  }
  caches
    .keys()
    .then((names) => Promise.all(names.map((name) => caches.delete(name))))
    .then(done)
    .catch(done);
}

export function reloadPrototypeAfterUpdate(): void {
  try {
    sessionStorage.removeItem('vite_preload_reload_attempted');
  } catch (_) {}
  clearAppCachesThen(() => window.location.reload());
}
