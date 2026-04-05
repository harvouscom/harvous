/** Gap between offline chip bottom and Add note anchor top (matches OfflineIndicator). */
export const CHIP_GAP_PX = 8;

/** Fixed `bottom` when no Add note anchor is found. */
export const CHIP_FALLBACK_BOTTOM_PX = 100;

/** Default chip height before `offsetHeight` is available. */
export const DEFAULT_OFFLINE_CHIP_HEIGHT_PX = 36;

const CHIP_TOP_MIN_PX = 8;

export function pickAddNoteAnchor(): Element | null {
  const wrapper = document.querySelector('.create-note-button-wrapper');
  const notePage = document.querySelector('.note-page-add-button');
  for (const el of [wrapper, notePage]) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * Distance from viewport bottom to the offline chip's bottom edge (same math as fixed chip + clamped top).
 * Use as CSS `bottom` on a fixed toaster to align toast stack with the chip.
 */
export function getMobileChipBottomInsetPx(chipHeightPx: number = DEFAULT_OFFLINE_CHIP_HEIGHT_PX): number {
  if (typeof window === 'undefined') return CHIP_FALLBACK_BOTTOM_PX;
  const anchor = pickAddNoteAnchor();
  if (!anchor) return CHIP_FALLBACK_BOTTOM_PX;
  const r = anchor.getBoundingClientRect();
  const topUnclamped = r.top - CHIP_GAP_PX - chipHeightPx;
  const topClamped = Math.max(CHIP_TOP_MIN_PX, topUnclamped);
  const chipBottomFromTop = topClamped + chipHeightPx;
  return window.innerHeight - chipBottomFromTop;
}

export const HARVOUS_TOASTER_MOBILE_BOTTOM_VAR = '--harvous-toaster-mobile-bottom';
