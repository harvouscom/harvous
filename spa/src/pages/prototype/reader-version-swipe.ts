/**
 * When a drag across the chapter means "show me the other version".
 *
 * Pulled out for the same reason `nextVerseSelection` was: it is the whole rule for a gesture,
 * and a rule buried in a pointer handler cannot be read or tested without a touchscreen.
 *
 * The hard part is not the swipe, it is everything a swipe must not be. This surface's primary
 * gesture is vertical scrolling, and its second is dragging across words to mark a phrase. A
 * rule that fired on horizontal distance alone would turn every slightly-diagonal flick down
 * the page into a version swap — which is the worst kind of bug here, because the text changes
 * under someone who was only trying to keep reading.
 */

/** How far across before a drag is a swipe at all, in CSS pixels. */
export const SWIPE_MIN_DISTANCE = 56;

/**
 * How much the horizontal has to beat the vertical.
 *
 * A scroll flick is rarely perfectly vertical — a thumb arcs. At 1.5 a drag has to be clearly
 * sideways rather than merely sideways-ish, which is the difference between a gesture someone
 * made and one their hand happened to describe.
 */
export const SWIPE_DOMINANCE = 1.5;

/**
 * Which way the drag went, or `null` if it was not a swipe.
 *
 * `left` means the finger travelled left — the same direction as turning to the next thing
 * everywhere else, so it reads as moving forward through the versions rather than as dragging
 * the text itself.
 */
export function swipeDirection(dx: number, dy: number): 'left' | 'right' | null {
  const across = Math.abs(dx);
  if (across < SWIPE_MIN_DISTANCE) return null;
  if (across < Math.abs(dy) * SWIPE_DOMINANCE) return null;
  return dx < 0 ? 'left' : 'right';
}
