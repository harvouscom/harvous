const VIEWPORT_MARGIN = 12;

export type AnchoredPopoverPosition = { top: number; left: number };

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
  if (typeof window === 'undefined') return { top: 0, left: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = anchor.bottom + offset;
  if (top + cardHeight + VIEWPORT_MARGIN > vh) {
    top = anchor.top - cardHeight - offset;
  }
  if (top < VIEWPORT_MARGIN) {
    top = VIEWPORT_MARGIN;
  }

  const anchorCenter = anchor.left + anchor.width / 2;
  let left = anchorCenter - cardWidth / 2;
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  if (left + cardWidth + VIEWPORT_MARGIN > vw) {
    left = vw - cardWidth - VIEWPORT_MARGIN;
  }

  return { top, left };
}
