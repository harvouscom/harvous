/**
 * Pull a collapsed lane's top back under the reader.
 *
 * A "N more" bar sits at the *bottom* of the list it opens, so collapsing removes
 * everything above the cursor: the reader is left looking at whatever had been
 * further down the page, and the list they were just reading has scrolled off the
 * top. Every fold on Home has this problem, so they share one answer.
 *
 * Only on the way in. Expanding grows downward from a bar the reader can still
 * see, and moving the page then would take it away from them.
 */

/**
 * The element that actually scrolls this lane.
 *
 * Home does not scroll the document — `.proto-feed-sheet__body` does — so anything
 * comparing against `window.innerHeight` measures the wrong box. Walks up for the
 * first ancestor that both allows overflow and has somewhere to go.
 */
function scrollportFor(el: Element): Element | null {
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * @param section The lane to bring back into view — `.proto-home-section`, not the
 *   button. Scrolling the button would land on the bottom of the collapsed list,
 *   which is the thing being fixed.
 */
export function scrollCollapsedSectionIntoView(section: Element | null | undefined): void {
  if (!section || typeof window === 'undefined') return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  /*
   * Two frames, not one, and the second is the one that matters.
   *
   * The caller is a click handler, so at the first frame React may not have
   * committed the collapse yet — the lane is still at its expanded height, and a
   * scroll computed then targets a layout that is about to disappear. Review
   * showed this exactly: the scroll fired against the tall list and settled 265px
   * short once the rows actually went. The second frame measures the lane the
   * reader will be looking at.
   */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const port = scrollportFor(section);
      const top = section.getBoundingClientRect().top;
      const portTop = port ? port.getBoundingClientRect().top : 0;
      /*
       * Only when the start of the list is actually above the fold of the scrollport.
       * Collapsing while the heading is already on screen has taken nothing away, and
       * scrolling then would be movement the reader did not ask for.
       */
      if (top >= portTop) return;
      /*
       * `block: 'start'`, not `'nearest'`. A lane taller than its scrollport already
       * spans the whole visible area, so `'nearest'` considers it in view and refuses
       * to move — which is exactly the case that needs moving, and is how Review
       * ended up collapsing to a heading still 265px above the top edge.
       */
      section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });
}

/** The lane a fold control lives in, found from the control itself. */
export function enclosingHomeSection(el: Element | null | undefined): Element | null {
  return el?.closest('.proto-home-section') ?? null;
}
