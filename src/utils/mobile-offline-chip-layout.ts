/** Gap between offline chip bottom and Add note anchor top (matches OfflineIndicator). */
export const CHIP_GAP_PX = 8;

/**
 * CSS `bottom` when no Add note anchor is found — a plain safe-area clearance, not a guess at
 * the classic chip's height.
 *
 * `.create-note-button-wrapper` (`CreateNoteButton.tsx`) has no JSX usage left anywhere in this
 * app — pre-SPA-migration debris — so `pickAddNoteAnchor()` below always returns null and this
 * fallback is not an edge case, it is the only path every toast on a narrow viewport actually
 * takes. The old flat `100px` was tuned for whatever classic chrome used to sit above that
 * button; on the 2.0 shell it was 100px of dead air under a toast on a page with no bottom
 * chrome at all (Home has none). A CSS expression, not a number, so it composes with the
 * device's own inset the same way `.proto-shell-frame`'s margin does in prototype-shell.css —
 * unlike that fixed 100px, this one still tracks the notch on any future page that grows one.
 */
export const CHIP_FALLBACK_BOTTOM_CSS = 'calc(16px + env(safe-area-inset-bottom, 0px))';

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
 * CSS length for the toaster's `bottom` — distance from viewport bottom to the offline chip's
 * bottom edge when a chip anchor exists (same math as fixed chip + clamped top), otherwise the
 * safe-area fallback above. A string, not a number: only the anchor-found branch is a plain
 * pixel measurement, and callers should set it on the CSS custom property verbatim rather than
 * appending a unit that would break the fallback's `calc()`.
 */
export function getMobileChipBottomInsetPx(chipHeightPx: number = DEFAULT_OFFLINE_CHIP_HEIGHT_PX): string {
  if (typeof window === 'undefined') return CHIP_FALLBACK_BOTTOM_CSS;
  const anchor = pickAddNoteAnchor();
  if (!anchor) return CHIP_FALLBACK_BOTTOM_CSS;
  const r = anchor.getBoundingClientRect();
  const topUnclamped = r.top - CHIP_GAP_PX - chipHeightPx;
  const topClamped = Math.max(CHIP_TOP_MIN_PX, topUnclamped);
  const chipBottomFromTop = topClamped + chipHeightPx;
  return `${window.innerHeight - chipBottomFromTop}px`;
}

export const HARVOUS_TOASTER_MOBILE_BOTTOM_VAR = '--harvous-toaster-mobile-bottom';
