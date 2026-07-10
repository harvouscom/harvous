/** Expected max height for placement (before content finishes loading). */
export function protoAnchoredPopoverPlacementHeight(
  measuredHeight: number,
  maxHeightPx: number,
  vhFraction: number,
): number {
  if (typeof window === 'undefined') return measuredHeight;
  return Math.max(measuredHeight, Math.min(maxHeightPx, window.innerHeight * vhFraction));
}

export type CenteredPortaledDialogPositionOptions = {
  viewportMargin?: number;
  /** Preferred top offset as a fraction of viewport height (default 0.12). */
  topVhFraction?: number;
  fallbackWidth?: number;
  fallbackHeight?: number;
};

export type AnchoredPopoverPositionOptions = CenteredPortaledDialogPositionOptions & {
  /** CSS max-height px cap (default 520). */
  maxHeightPx?: number;
  /** CSS max-height vh fraction (default 0.72). */
  vhFraction?: number;
};

/** Centered desktop portaled sheet dialogs (new folder/thread, add notes, etc.). */
export function computeCenteredPortaledDialogPosition(
  cardEl: HTMLElement,
  options: CenteredPortaledDialogPositionOptions = {},
): { top: number; left: number } {
  const viewportMargin = options.viewportMargin ?? 12;
  const topVhFraction = options.topVhFraction ?? 0.12;
  const rect = cardEl.getBoundingClientRect();
  const cardHeight = rect.height || options.fallbackHeight || 440;
  const cardWidth = rect.width || options.fallbackWidth || 340;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: Math.max(viewportMargin, (vw - cardWidth) / 2),
    top: Math.max(viewportMargin, Math.min(vh - cardHeight - viewportMargin, vh * topVhFraction)),
  };
}

/** Main-column inset — matches `.proto-inspector-desktop` / `.proto-side-panel`. */
export const PROTO_MAIN_COLUMN_PANEL_INSET = 8;

export function resolveMainColumnPopoverHost(): Element | null {
  if (typeof document === 'undefined') return null;
  return (
    document.querySelector('.proto-shell__right-panel-host') ??
    document.querySelector('.proto-shell__main-inner')
  );
}

/** Fixed top-right of the prototype main column (stable while browsing connected notes). */
export function computeMainColumnTopRightPopoverPosition(
  cardEl: HTMLElement,
  options: { inset?: number; viewportMargin?: number } = {},
): { top: number; left: number } {
  const inset = options.inset ?? PROTO_MAIN_COLUMN_PANEL_INSET;
  const viewportMargin = options.viewportMargin ?? 12;
  const hostRect = resolveMainColumnPopoverHost()?.getBoundingClientRect();
  const cardWidth = cardEl.getBoundingClientRect().width;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;

  if (hostRect) {
    const top = Math.max(viewportMargin, hostRect.top + inset);
    const left = Math.max(
      viewportMargin,
      Math.min(hostRect.right - cardWidth - inset, vw - cardWidth - viewportMargin),
    );
    return { top, left };
  }

  return {
    top: Math.max(viewportMargin, inset),
    left: Math.max(viewportMargin, vw - cardWidth - inset),
  };
}

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
