import type { EditorView } from '@tiptap/pm/view';

/** Room left between the caret's line and the top of the format bar. */
const CARET_CLEARANCE_PX = 12;
const CARET_TOP_CLEARANCE_PX = 8;

/**
 * Keep the caret's line visible above the prototype format bar.
 *
 * In format mode the bar is out of flow (`position: absolute; bottom: 0`) and floats over the
 * bottom of `.proto-editor-scroll`. ProseMirror's own scroll-to-selection only clears the
 * scroller's edge — which is under the bar — so on a phone the line being typed slid behind it.
 * This measures the caret and the bar from the same viewport (both rects are visual-viewport
 * relative on iOS) and scrolls the scroller by exactly the overlap.
 *
 * Returns true when it owned the scroll (the bar is up and the editor is in the prototype
 * scroller), so it can stand in for ProseMirror's `handleScrollToSelection`.
 */
export function scrollCaretClearOfFormatBar(view: EditorView): boolean {
  if (typeof document === 'undefined') return false;
  const dom = view.dom as HTMLElement;
  const scroller = dom.closest('.proto-editor-scroll');
  if (!(scroller instanceof HTMLElement)) return false;
  const bar = document.querySelector('.proto-editor-bottom-bar[data-mode="format"]');
  if (!(bar instanceof HTMLElement)) return false;

  let caret: { top: number; bottom: number };
  try {
    caret = view.coordsAtPos(view.state.selection.head);
  } catch {
    return false;
  }
  const scrollerRect = scroller.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  // A bar with no box (collapsed, display:none) hides nothing.
  const barTop = barRect.height > 0 ? barRect.top : scrollerRect.bottom;
  const visibleBottom = Math.min(scrollerRect.bottom, barTop) - CARET_CLEARANCE_PX;
  const visibleTop = scrollerRect.top + CARET_TOP_CLEARANCE_PX;

  const before = scroller.scrollTop;
  if (caret.bottom > visibleBottom) {
    scroller.scrollTop += Math.ceil(caret.bottom - visibleBottom);
  } else if (caret.top < visibleTop) {
    scroller.scrollTop -= Math.ceil(visibleTop - caret.top);
  }
  if (scroller.scrollTop !== before) repaintNativeCaretAfterScroll(view);
  return true;
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS reports a desktop UA.
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

let repaintRaf: number | null = null;

/**
 * iOS WebKit does not move the *painted* caret when an `overflow: auto` scroller is scrolled
 * from script — the text moves, the caret stays where it was drawn, so it sits a line or two
 * off from where typing lands (worst right above the format bar, where this helper scrolls
 * most). Re-asserting the same DOM selection on the next frame makes WebKit repaint it. The
 * selection is read back from the DOM rather than ProseMirror so nothing about it changes.
 */
export function repaintNativeCaretAfterScroll(view: EditorView): void {
  if (!isAppleTouchDevice() || typeof requestAnimationFrame === 'undefined') return;
  if (repaintRaf != null) cancelAnimationFrame(repaintRaf);
  repaintRaf = requestAnimationFrame(() => {
    repaintRaf = null;
    try {
      if ((view as EditorView & { isDestroyed?: boolean }).isDestroyed || !view.hasFocus()) return;
      const sel = view.dom.ownerDocument.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return;
      if (!view.dom.contains(sel.anchorNode) || !view.dom.contains(sel.focusNode)) return;
      sel.setBaseAndExtent(sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset);
    } catch {
      /* a detached node mid-patch: the next keystroke repaints anyway */
    }
  });
}
