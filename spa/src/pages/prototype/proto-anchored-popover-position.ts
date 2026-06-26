/** Expected max height for placement (before content finishes loading). */
export function protoAnchoredPopoverPlacementHeight(
  measuredHeight: number,
  maxHeightPx: number,
  vhFraction: number,
): number {
  if (typeof window === 'undefined') return measuredHeight;
  return Math.max(measuredHeight, Math.min(maxHeightPx, window.innerHeight * vhFraction));
}

export type AnchoredPopoverPositionOptions = {
  /** CSS max-height px cap (default 520). */
  maxHeightPx?: number;
  /** CSS max-height vh fraction (default 0.72). */
  vhFraction?: number;
};

export function computeAnchoredPopoverPosition(
  cardEl: HTMLElement,
  anchorRect: DOMRect | null,
  options: AnchoredPopoverPositionOptions = {},
): { top: number; left: number } {
  const maxHeightPx = options.maxHeightPx ?? 520;
  const vhFraction = options.vhFraction ?? 0.72;
  const measuredHeight = cardEl.getBoundingClientRect().height;
  const cardHeight = protoAnchoredPopoverPlacementHeight(measuredHeight, maxHeightPx, vhFraction);
  const cardWidth = cardEl.getBoundingClientRect().width;
  const viewportMargin = 12;
  const offset = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeRect = activeEl?.getBoundingClientRect() ?? null;
  const effectiveAnchor = anchorRect ?? activeRect;

  let top: number;
  let left: number;
  if (effectiveAnchor) {
    const spaceBelow = vh - effectiveAnchor.bottom - offset - viewportMargin;
    const spaceAbove = effectiveAnchor.top - offset - viewportMargin;
    if (cardHeight <= spaceBelow) {
      top = effectiveAnchor.bottom + offset;
    } else if (cardHeight <= spaceAbove) {
      top = effectiveAnchor.top - cardHeight - offset;
    } else if (spaceAbove >= spaceBelow) {
      top = effectiveAnchor.top - cardHeight - offset;
    } else {
      top = effectiveAnchor.bottom + offset;
    }
    top = Math.max(viewportMargin, Math.min(top, vh - measuredHeight - viewportMargin));
    left = effectiveAnchor.left;
    if (left + cardWidth + viewportMargin > vw) left = vw - cardWidth - viewportMargin;
    if (left < viewportMargin) left = viewportMargin;
  } else {
    left = Math.max(viewportMargin, (vw - cardWidth) / 2);
    top = Math.max(viewportMargin, Math.min(vh - measuredHeight - viewportMargin, vh * 0.2));
  }
  return { top, left };
}
