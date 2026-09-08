/**
 * The chip's measured box, handed to the panel's opening morph.
 *
 * The panel grows out of the chip, so its first frame has to be the chip's actual box —
 * not a guess. Both dimensions are content-dependent ("Library" and "Sermon notes +2" are
 * very different pills), so the rect is measured at the moment of the click.
 *
 * A module-level value rather than React state: it only ever feeds an animation's starting
 * frame, and routing a layout measurement through a render would put it on the critical
 * path of opening the panel.
 */

export type LibraryChipRect = {
  width: number;
  height: number;
  /** Viewport-relative, for the vertical offset the FLIP has to undo. */
  top: number;
  left: number;
};

let lastRect: LibraryChipRect | null = null;

export function publishLibraryChipRect(rect: LibraryChipRect) {
  lastRect = rect;
}

/**
 * The rect the panel should morph from, or `null` when there isn't a usable one.
 *
 * `null` is a real answer, not a failure to handle: the panel can be opened by a chord
 * with no chip involved, and a chip that has not painted has no box to grow from. The
 * caller degrades to a plain fade rather than scaling out of a guessed rectangle, which
 * would land the first frame somewhere the reader never clicked.
 */
export function readLibraryChipRect(): LibraryChipRect | null {
  if (!lastRect) return null;
  if (lastRect.width <= 0 || lastRect.height <= 0) return null;
  return lastRect;
}

/**
 * Forget the measurement.
 *
 * Called when the panel is opened by something other than the chip, so a stale rect from
 * an earlier click cannot be used as this open's origin.
 */
export function clearLibraryChipRect() {
  lastRect = null;
}
