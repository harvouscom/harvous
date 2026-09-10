/**
 * Where the reader scrolls to when a reference sends you to a passage — and when it doesn't.
 *
 * Pulled out of `PrototypeBibleReaderPane` for the same reason `nextVerseSelection` was: it is
 * the whole rule for one interaction, and a rule that lives inside a layout effect cannot be
 * read or tested without mounting a chapter and measuring it.
 *
 * Everything here is in one coordinate space — client coordinates, as `getBoundingClientRect`
 * reports them — plus the scroller's current `scrollTop`. The caller measures; this decides.
 */

/**
 * How much clear air a landed passage needs at each end of the viewport before it counts as
 * "already on screen". Without it a range whose last line ends one pixel above the fold reads
 * as in view and is left flush against the edge, which is exactly the case where a small
 * scroll helps most.
 */
export const READER_LANDING_COMFORT = 24;

/** The lead-in kept above a landed passage, as a share of the viewport. */
export const READER_LANDING_LEAD_RATIO = 0.18;

/**
 * …and its ceiling. On a tall desktop pane 18% is most of a screenful of empty chapter above
 * the verse you asked for, so the proportion stops mattering past this.
 */
export const READER_LANDING_LEAD_MAX = 140;

/**
 * Below this, the scroller is not a viewport yet — it is a collapsed box mid-layout, and every
 * rect measured inside it is degenerate. No reading surface is this short, so treating it as
 * "not ready" can never mistake a real pane for one.
 */
export const READER_LANDING_MIN_VIEWPORT = 120;

export interface LandingScrollInput {
  /** The scroller's current position. */
  scrollTop: number;
  /** The scroller's visible height and total content height. */
  clientHeight: number;
  scrollHeight: number;
  /** The scroller's own top edge, in client coordinates. */
  viewportTop: number;
  /** Top of the passage's FIRST verse, in client coordinates. */
  startTop: number;
  /** Bottom of the passage's LAST verse, in client coordinates. */
  endBottom: number;
}

/**
 * The `scrollTop` to land on, or null to leave the page where it is.
 *
 * Two decisions, in order.
 *
 * **Whether to move at all.** Centring the start verse unconditionally moved the page even when
 * the passage was already sitting there to be read — opening John 3:1-3 scrolled the chapter
 * heading off the top to put verse 1 in the middle of the screen, which loses the context the
 * reference was pointing into and reads as the page flinching. If the whole range is
 * comfortably in view, the right amount of scrolling is none.
 *
 * **Where to move to.** Aligned to the START of the passage, with a lead-in above it, rather
 * than centred on it. A reference names where a passage begins, so beginning is what should be
 * near the top — centring spent half the viewport on the verses before it and pushed the rest
 * of the passage down into the fold. The lead-in keeps the start off the very edge, so the line
 * above it stays visible and the passage reads as being *in* the chapter rather than clipped to
 * the top of it.
 *
 * A passage taller than the viewport can never be "already in view", so it always lands — at
 * its start, which is the only end of it that can be shown.
 */
export function landingScrollTop(input: LandingScrollInput): number | null {
  const { scrollTop, clientHeight, scrollHeight, viewportTop, startTop, endBottom } = input;

  const alreadyInView =
    startTop >= viewportTop + READER_LANDING_COMFORT &&
    endBottom <= viewportTop + clientHeight - READER_LANDING_COMFORT;
  if (alreadyInView) return null;

  const lead = Math.max(
    READER_LANDING_COMFORT,
    Math.min(READER_LANDING_LEAD_MAX, clientHeight * READER_LANDING_LEAD_RATIO),
  );
  const target = scrollTop + (startTop - viewportTop) - lead;
  /*
   * Clamped here rather than left to the browser so the number this function reasons about and
   * the number the scroller ends up at are the same one — a passage near the end of a chapter
   * computes a target past the last scrollable pixel, and silently landing somewhere other than
   * where we said we would is how a "why didn't it scroll" bug starts.
   */
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  return Math.min(maxScroll, Math.max(0, target));
}
