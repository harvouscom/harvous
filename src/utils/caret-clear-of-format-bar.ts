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

  if (caret.bottom > visibleBottom) {
    scroller.scrollTop += Math.ceil(caret.bottom - visibleBottom);
  } else if (caret.top < visibleTop) {
    scroller.scrollTop -= Math.ceil(visibleTop - caret.top);
  }
  return true;
}
