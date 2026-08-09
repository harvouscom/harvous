/**
 * "The prototype shell's chrome geometry just moved."
 *
 * On mobile note routes the shell frame is resized *programmatically* — the keyboard-settle code in
 * `SimplifiedPrototypeLayout` writes inline `height` / `margin-top` onto `.proto-shell-frame` and
 * re-runs across a settle window (rAF + 150ms + 450ms) to ride out the iOS keyboard animation and
 * the Safari bottom-bar collapse. Those writes move every line of the editor, but they emit no
 * `scroll` and no `resize`, so a `position: fixed` overlay positioned from a client rect has no way
 * to know it went stale. That is why the FIRST scripture-draft ✓ in a note lands misaligned (it is
 * measured 260ms after the last keystroke, between two settle passes) while later ones are fine —
 * by then `apply()` is a no-op.
 *
 * Anything that positions a fixed overlay from `getBoundingClientRect()` / `coordsAtPos()` should
 * subscribe here alongside its existing scroll/resize listeners.
 */

export const PROTO_VIEWPORT_SETTLE_EVENT = 'harvous:proto-viewport-settle';

export function emitProtoViewportSettle(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PROTO_VIEWPORT_SETTLE_EVENT));
}

/** Subscribe to chrome-geometry changes. Returns an unsubscribe fn (no-op during SSR). */
export function onProtoViewportSettle(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PROTO_VIEWPORT_SETTLE_EVENT, handler);
  return () => window.removeEventListener(PROTO_VIEWPORT_SETTLE_EVENT, handler);
}
