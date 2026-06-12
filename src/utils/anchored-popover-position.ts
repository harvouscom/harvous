const VIEWPORT_MARGIN = 12;

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
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const belowTop = anchor.bottom + offset;
  const fitsBelow = belowTop + cardHeight + VIEWPORT_MARGIN <= vh;
  const placement: AnchoredPopoverPlacement = fitsBelow ? 'below' : 'above';

  let top = fitsBelow ? belowTop : anchor.top - cardHeight - offset;
  if (top < VIEWPORT_MARGIN) {
    top = VIEWPORT_MARGIN;
  }

  const anchorCenter = anchor.left + anchor.width / 2;
  let left = anchorCenter - cardWidth / 2;
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  if (left + cardWidth + VIEWPORT_MARGIN > vw) {
    left = vw - cardWidth - VIEWPORT_MARGIN;
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
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const belowTop = anchor.bottom + offset;
  const fitsBelow = belowTop + cardHeight + VIEWPORT_MARGIN <= vh;
  const placement: AnchoredPopoverPlacement = fitsBelow ? 'below' : 'above';

  let top = fitsBelow ? belowTop : anchor.top - cardHeight - offset;
  if (top < VIEWPORT_MARGIN) {
    top = VIEWPORT_MARGIN;
  }

  let left = anchor.right - cardWidth;
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  if (left + cardWidth + VIEWPORT_MARGIN > vw) {
    left = vw - cardWidth - VIEWPORT_MARGIN;
  }

  return { top, left, placement };
}
