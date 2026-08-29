/**
 * Fade a label only when it is actually cut off — measured, not estimated.
 *
 * The hover marquee's fade was decided by a character count (`MARQUEE_FADE_MIN_CHARS`, 24),
 * which is a fair guess for the 304px sidebar rail it was tuned on and wrong everywhere else.
 * On a 640px feed sheet "Returned to God's Sovereignty" is 29 characters and fits with room
 * to spare, so it stayed above the threshold, kept its `mask-image`, and picked up the faint
 * compositing haze that mask brings — a fade over a label with nothing to hide.
 *
 * A character count cannot be made right, because the answer depends on the font, the
 * available width and the string, and only the browser knows all three. So ask it. The
 * marquee runs on hover, and so does the fade, which means the measurement can happen on
 * `pointerenter` and cost nothing at all the rest of the time — no observers, no layout on
 * mount, nothing per row in a long list.
 *
 * `marqueePace`'s estimate stays as the value React renders. It only ever *removes* the mask
 * for labels too short to need one, so it is right whenever it fires; this corrects the other
 * direction, where the estimate was too cautious.
 */

/** A `.proto-marquee` wraps its text in a span; a `.proto-marquee-self` is its own text. */
function measuredChild(el: HTMLElement): HTMLElement {
  if (!el.classList.contains('proto-marquee')) return el;
  return (el.firstElementChild as HTMLElement | null) ?? el;
}

/**
 * Set each label's mask to match whether it overflows its own box.
 *
 * The 1px slack absorbs sub-pixel rounding: a label that fits exactly can measure a fraction
 * wider than its box, and fading it would be the bug this fixes, one pixel smaller.
 */
export function syncMarqueeMasks(root: HTMLElement): void {
  const labels = root.querySelectorAll<HTMLElement>('.proto-marquee, .proto-marquee-self');
  for (const label of labels) {
    const overflows = measuredChild(label).scrollWidth > label.clientWidth + 1;
    /*
     * Written straight to the element rather than held in state. The property React renders
     * is the estimate; this is a correction applied for the duration of a hover, and a
     * re-render simply restores the estimate and the next hover measures again. Nothing
     * downstream reads it, so there is no state to keep in step.
     */
    label.style.setProperty('--proto-marquee-mask', overflows ? '' : 'none');
  }
}

/** Handler for the hover root — the element the marquee's `:hover` selectors key on. */
export function handleMarqueeHover(event: { currentTarget: EventTarget | null }): void {
  const root = event.currentTarget;
  if (root instanceof HTMLElement) syncMarqueeMasks(root);
}
