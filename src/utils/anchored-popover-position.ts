import { getVisualViewportBox } from './visual-viewport-box';

const VIEWPORT_MARGIN = 12;

/**
 * The band these floaters are allowed to occupy, in the coordinate space anchor rects and
 * `position: fixed` already use.
 *
 * `window.innerHeight` is the LAYOUT viewport, which on iOS does not shrink when the software
 * keyboard opens. Clamping to it meant "fits below" could be answered with space that is
 * physically behind the keyboard, so a menu opened while typing rendered under it. The visual
 * viewport reports what is really on screen; `offsetTop` converts it back into layout
 * coordinates, so the numbers below stay directly comparable to `getBoundingClientRect()`.
 */
function visibleBounds(): { top: number; bottom: number; left: number; right: number } {
  const box = getVisualViewportBox();
  return {
    top: box.top,
    bottom: box.top + box.height,
    left: box.left,
    right: box.left + box.width,
  };
}

export type AnchoredPopoverPlacement = 'above' | 'below';

export type AnchoredPopoverPosition = {
  top: number;
  left: number;
  placement: AnchoredPopoverPlacement;
};

/**
 * Position a compact floater below an anchor, flipping above when near the viewport bottom.
 * Horizontally centers on the anchor and clamps to the viewport.
 */
export function computeAnchoredPopoverPosition(
  anchor: DOMRect,
  cardWidth: number,
  cardHeight: number,
  offset = 6,
): AnchoredPopoverPosition {
  if (typeof window === 'undefined') return { top: 0, left: 0, placement: 'below' };
  const bounds = visibleBounds();

  const belowTop = anchor.bottom + offset;
  const fitsBelow = belowTop + cardHeight + VIEWPORT_MARGIN <= bounds.bottom;
  const placement: AnchoredPopoverPlacement = fitsBelow ? 'below' : 'above';

  let top = fitsBelow ? belowTop : anchor.top - cardHeight - offset;
  if (top < bounds.top + VIEWPORT_MARGIN) {
    top = bounds.top + VIEWPORT_MARGIN;
  }

  const anchorCenter = anchor.left + anchor.width / 2;
  let left = anchorCenter - cardWidth / 2;
  if (left < bounds.left + VIEWPORT_MARGIN) left = bounds.left + VIEWPORT_MARGIN;
  if (left + cardWidth + VIEWPORT_MARGIN > bounds.right) {
    left = bounds.right - cardWidth - VIEWPORT_MARGIN;
  }

  return { top, left, placement };
}

/**
 * Position a compact floater below an anchor (right-aligned to the trigger),
 * flipping above when near the viewport bottom.
 */
export function computeRightAnchoredPopoverPosition(
  anchor: DOMRect,
  cardWidth: number,
  cardHeight: number,
  offset = 6,
): AnchoredPopoverPosition {
  if (typeof window === 'undefined') return { top: 0, left: 0, placement: 'below' };
  const bounds = visibleBounds();

  const belowTop = anchor.bottom + offset;
  const fitsBelow = belowTop + cardHeight + VIEWPORT_MARGIN <= bounds.bottom;
  const placement: AnchoredPopoverPlacement = fitsBelow ? 'below' : 'above';

  let top = fitsBelow ? belowTop : anchor.top - cardHeight - offset;
  if (top < bounds.top + VIEWPORT_MARGIN) {
    top = bounds.top + VIEWPORT_MARGIN;
  }

  let left = anchor.right - cardWidth;
  if (left < bounds.left + VIEWPORT_MARGIN) left = bounds.left + VIEWPORT_MARGIN;
  if (left + cardWidth + VIEWPORT_MARGIN > bounds.right) {
    left = bounds.right - cardWidth - VIEWPORT_MARGIN;
  }

  return { top, left, placement };
}
