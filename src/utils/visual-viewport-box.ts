/**
 * The rectangle actually visible to the user, in layout-viewport coordinates.
 *
 * On iOS a `position: fixed` element is positioned against the LAYOUT viewport, which does not
 * shrink when the software keyboard opens — so a bottom-anchored sheet lands *behind* the
 * keyboard, and `vh` units measure the large (un-shrunk) viewport. `window.visualViewport`
 * reports what's really on screen; pinning a fixed overlay to this box makes "bottom" mean
 * "just above the keyboard".
 *
 * This is the same visual-viewport correction the floating scripture-draft ✓ already applies
 * (see `updatePos` in TiptapEditor.tsx) — see
 * docs/troubleshooting/MOBILE_SCRIPTURE_PILL_TROUBLESHOOTING.md, "iOS limitations & gotchas".
 */
export interface VisualViewportBox {
  top: number;
  left: number;
  width: number;
  height: number;
  /** True when the visible area is much shorter than the window — i.e. a keyboard is up. */
  keyboardLikely: boolean;
}

/** Height difference above which we treat the gap as a software keyboard rather than browser chrome. */
const KEYBOARD_MIN_INSET = 100;

/**
 * Pass a window explicitly, or omit it to use the global one. Pass `null` for "no window at all"
 * (SSR) — an explicit `undefined` would otherwise be indistinguishable from omitting the argument.
 */
export function getVisualViewportBox(
  win?: Window | null,
): VisualViewportBox {
  const resolved = win === undefined ? (typeof window !== 'undefined' ? window : null) : win;
  const fallbackWidth = resolved?.innerWidth ?? 0;
  const fallbackHeight = resolved?.innerHeight ?? 0;
  const vv = resolved?.visualViewport;
  if (!vv) {
    return { top: 0, left: 0, width: fallbackWidth, height: fallbackHeight, keyboardLikely: false };
  }
  return {
    top: vv.offsetTop ?? 0,
    left: vv.offsetLeft ?? 0,
    width: vv.width ?? fallbackWidth,
    height: vv.height ?? fallbackHeight,
    keyboardLikely: fallbackHeight - (vv.height ?? fallbackHeight) > KEYBOARD_MIN_INSET,
  };
}

/** Inline style pinning a `position: fixed` overlay to the visible area. */
export function visualViewportOverlayStyle(box: VisualViewportBox): {
  position: 'fixed';
  top: number;
  left: number;
  width: number;
  height: number;
} {
  return {
    position: 'fixed',
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  };
}
