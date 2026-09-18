/**
 * Warm the note page's chunk so opening a note never waits on it.
 *
 * `PrototypeNotePage` is `lazy()` in the shell because it is what pulls TipTap and the whole
 * editor into the bundle — 118 KB gzipped of TipTap alone, which used to be `modulepreload`ed
 * before the sign-in screen could paint. Most routes never show it, so it has no business in
 * the initial payload that `perf:check` gates.
 *
 * But opening a note is the thing people do most, so the chunk should be in the cache well
 * before the first tap: idle after shell mount, and again on any row's intent (hover, focus,
 * pointerdown) through the same function — the second call is a no-op.
 *
 * Swallowed on failure for the same reason as `prefetch-library-panel-chunk.ts`: a miss right
 * after a deploy is expected, and the real open still reports through the router and
 * `vite:preloadError` in main.tsx.
 */

let pending: Promise<unknown> | null = null;

export function loadNotePageChunk() {
  return import('./PrototypeNotePage');
}

function load(): void {
  if (pending) return;
  pending = loadNotePageChunk().catch(() => {
    /* best-effort — see above. Cleared so a later intent can try again. */
    pending = null;
  });
}

/**
 * `idle` waits for the browser to be quiet (shell mount); without it the fetch starts now
 * (row intent). An intent that lands before the idle slot fires starts it early — the two
 * share one fetch either way.
 */
export function prefetchNotePageChunk(options: { idle?: boolean } = {}): void {
  if (pending) return;
  if (!options.idle) {
    load();
    return;
  }
  /*
   * A shorter leash than the Library panel's three seconds: the panel is opened second, a
   * note is usually opened first.
   */
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(load, { timeout: 1500 });
  } else {
    // Safari has no requestIdleCallback.
    setTimeout(load, 800);
  }
}
