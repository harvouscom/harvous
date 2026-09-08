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
 *
 * **Both the labels and the frame that clips them.** A row's two lines share one fade, painted
 * by `.proto-list-panel__row-text` rather than by either line — the CSS says why: the overflow
 * distance only resolves on the child that shrink-wraps its text, while the mask has to sit on
 * the parent that clips it. A first pass here corrected the labels alone and the gradient
 * survived untouched, because the labels were never the ones drawing it.
 */

/** The lines that can overflow. */
const LABEL_SELECTOR = '.proto-marquee, .proto-marquee-self';

/**
 * The boxes that clip those lines and paint the shared fade.
 *
 * Kept in step with the CSS rule that blanks a nested label's own mask — the same three
 * classes, because a frame is exactly a thing that fades on its children's behalf.
 */
const FRAME_SELECTOR =
  '.proto-list-panel__row-text, .proto-marquee-frame, .proto-church-tools__row-text';

/** A `.proto-marquee` wraps its text in a span; a `.proto-marquee-self` is its own text. */
function measuredChild(el: HTMLElement): HTMLElement {
  if (!el.classList.contains('proto-marquee')) return el;
  return (el.firstElementChild as HTMLElement | null) ?? el;
}

/**
 * The 1px slack absorbs sub-pixel rounding: a label that fits exactly can measure a fraction
 * wider than its box, and fading it would be the bug this fixes, one pixel smaller.
 */
function overflows(label: HTMLElement): boolean {
  return measuredChild(label).scrollWidth > label.clientWidth + 1;
}

/**
 * Match every mask under `root` to whether anything is actually cut off.
 *
 * Written straight to the elements rather than held in state. The property React renders is
 * the estimate; this is a correction applied for the duration of a hover, and a re-render
 * simply restores the estimate while the next hover measures again. Nothing downstream reads
 * it, so there is no state to keep in step.
 */
export function syncMarqueeMasks(root: HTMLElement): void {
  for (const label of root.querySelectorAll<HTMLElement>(LABEL_SELECTOR)) {
    label.style.setProperty('--proto-marquee-mask', overflows(label) ? '' : 'none');
  }

  /*
   * Then the frames, which is where a row's fade is actually painted. A frame fades on behalf
   * of both its lines, so it earns one only if one of them is genuinely cut off.
   */
  for (const frame of root.querySelectorAll<HTMLElement>(FRAME_SELECTOR)) {
    const labels = [...frame.querySelectorAll<HTMLElement>(LABEL_SELECTOR)];
    frame.style.setProperty('--proto-marquee-mask', labels.some(overflows) ? '' : 'none');
  }
}

/** Handler for the hover root — the element the marquee's `:hover` selectors key on. */
export function handleMarqueeHover(event: { currentTarget: EventTarget | null }): void {
  const root = event.currentTarget;
  if (root instanceof HTMLElement) syncMarqueeMasks(root);
}
