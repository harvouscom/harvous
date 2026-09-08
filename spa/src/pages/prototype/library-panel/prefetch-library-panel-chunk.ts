/**
 * Warm the Library panel's chunk so the first open matches every later one.
 *
 * The panel is `lazy()`-loaded and mounts only once `libraryPanelMounted` flips, so the very
 * first summon pays for fetching and parsing ~93 KB before anything can render. It renders
 * behind `<Suspense fallback={null}>` on purpose — a placeholder box would play the opening
 * morph on chrome about to be replaced — which means that first wait shows *nothing at all*.
 * The comment at that call site says the chunk lands in a few ms, and it does; that is only
 * true once it is already in the cache. This is what puts it there.
 *
 * Warming it here rather than dropping the `lazy()` keeps it off the initial payload, which
 * `perf:check` gates — the panel is the browse surface, not something every route needs
 * parsed before first paint.
 */

let prefetchStarted = false;

/**
 * Fire-and-forget, and deliberately swallowed.
 *
 * A miss is expected right after a deploy: the hashed chunk this build points at is gone, and
 * an uncaught rejection would surface as a "Failed to fetch dynamically imported module"
 * diagnostic for what is only a warm-up. Opening the panel for real still reports through the
 * router, and `vite:preloadError` in main.tsx owns recovery.
 */
export function prefetchLibraryPanelChunk(): void {
  if (prefetchStarted) return;
  prefetchStarted = true;

  const load = () => {
    void import('./PrototypeLibraryPanelHost').catch(() => {
      /* best-effort — see above */
    });
  };

  /*
   * Idle, with a longer leash than the settings prefetch's two seconds.
   *
   * That one fires from a sheet the reader has already opened, so its work is the only thing
   * competing. This one fires at shell mount, while Activity is still composing itself out of
   * thirty-odd requests — forcing a 93 KB fetch into the middle of that would trade a delay the
   * reader asked for against one they did not. Three seconds is long enough that the initial
   * burst has normally settled before the timeout ever has to fire.
   */
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(load, { timeout: 3000 });
  } else {
    // Safari has no requestIdleCallback.
    setTimeout(load, 1500);
  }
}
