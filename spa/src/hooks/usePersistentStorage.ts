import { useEffect } from 'react';

/**
 * Ask the browser to stop treating this origin's storage as disposable.
 *
 * ## Why this matters more than any size limit
 *
 * Everything offline lives in one IndexedDB origin: notes not yet synced, the sync queue,
 * cached threads, and the Bible packs. Storage that has not been granted persistence is
 * *best-effort* — under pressure a browser evicts whole origins, not the largest table in
 * them, so the thing that goes is a person's unwritten notes alongside the scripture.
 *
 * The offline-pack limit was standing in for this. `MAX_OFFLINE_TRANSLATIONS` is documented
 * as a storage guard — "browsers evict whole origins rather than individual records… so a
 * reader who saves everything risks losing everything, including their unsynced notes" — but
 * three translations is 14MB against a multi-gigabyte quota, and the app's own service-worker
 * asset cache is already nearly three times that with no limit at all. Rationing the small
 * bucket does not change an eviction decision made about the whole origin. This does.
 *
 * ## What it actually does
 *
 * `persist()` resolves true if the origin is now exempt from eviction under pressure.
 * Browsers answer it differently — some grant it silently on an engagement signal, some
 * prompt, some decline — and a false is not a failure to handle: it means storage stays
 * best-effort, which is where it already was. Nothing is blocked on the answer.
 *
 * Called once per session, and it is cheap to call when already granted: `persisted()` first
 * so a granted origin costs one resolved promise and never re-asks.
 */
export function usePersistentStorage(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
    void (async () => {
      try {
        /* Already granted is the common case after the first visit — asking again is
           harmless but some browsers count a repeat request against the heuristic that
           decides it, so the cheap check comes first. */
        if (await navigator.storage.persisted?.()) return;
        await navigator.storage.persist();
      } catch {
        /* Storage API unavailable or refused. Best-effort storage is the status quo, not a
           degradation, so there is nothing to tell anyone. */
      }
    })();
  }, []);
}
