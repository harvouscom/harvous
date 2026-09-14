const STUDY_DOCK_COLLAPSED_CARD_PAD_BOTTOM = 10;

/** Card chrome height when collapsed (header band only when expanded). */
export function measureStudyDockCollapsedChromeHeight(cardOuter: HTMLElement): number {
  const card = cardOuter.querySelector('.study-dock-card__card');
  const header = cardOuter.querySelector('.study-dock-card__header');
  if (!(card instanceof HTMLElement) || !(header instanceof HTMLElement)) {
    return cardOuter.getBoundingClientRect().height;
  }

  const isCollapsed =
    card.classList.contains('study-dock-card__card--collapsed') || card.dataset.expanded !== 'true';

  if (isCollapsed) {
    return cardOuter.getBoundingClientRect().height;
  }

  const outerRect = cardOuter.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const outerPadBottom = parseFloat(getComputedStyle(cardOuter).paddingBottom) || 0;
  return (
    headerRect.bottom - outerRect.top + STUDY_DOCK_COLLAPSED_CARD_PAD_BOTTOM + outerPadBottom
  );
}

/** Pin drag-handle divider to collapsed card chrome, not expanded passage height. */
export function syncStudyDockDragHandleHeight(handle: HTMLElement, cardOuter: HTMLElement): void {
  const chromeHeight = measureStudyDockCollapsedChromeHeight(cardOuter);
  if (chromeHeight <= 0) return;
  const marginBottom = parseFloat(getComputedStyle(handle).marginBottom) || 0;
  const handleHeight = Math.max(22, Math.round(chromeHeight - marginBottom));
  handle.style.setProperty('--study-dock-drag-handle-height', `${handleHeight}px`);
}

function resetStudyDockCenterOffset(shell: HTMLElement | null): void {
  shell?.style.setProperty('--proto-study-dock-center-offset', '0px');
}

function readElementTranslateX(el: HTMLElement): number {
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === 'none') return 0;
  if (typeof DOMMatrixReadOnly !== 'undefined') {
    return new DOMMatrixReadOnly(transform).m41;
  }
  const match = transform.match(/matrix\((?:[^,]+,\s*){4}([^,)]+)/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * The paper the dock should sit centred under.
 *
 * Exported because the carousel has to agree with this: it used to look for
 * `.proto-editor-paper` itself and give up when there was none, which is every chapter in
 * the Bible reader — so a dock opened while reading never centred on the column it belongs
 * to, and the ladder below quietly fell through to the whole main cell instead.
 *
 * The reading column ranks with the note's paper because it is the same thing in the other
 * surface: the 720px sheet the words are on. Everything after is a fallback for surfaces
 * that have neither.
 */
export function resolveStudyDockCenterTarget(): HTMLElement | null {
  const paper = document.querySelector('.proto-editor-paper');
  if (paper instanceof HTMLElement) return paper;

  const readerColumn = document.querySelector('.pds-reader__column');
  if (readerColumn instanceof HTMLElement) return readerColumn;

  const wrap = document.querySelector('.proto-editor-content-wrap');
  if (wrap instanceof HTMLElement) return wrap;

  const surface = document.querySelector('.proto-editor-surface');
  if (surface instanceof HTMLElement) return surface;

  const mainCell = document.querySelector('.proto-shell__main-cell');
  if (mainCell instanceof HTMLElement) return mainCell;

  return null;
}

function syncMeasuredPaperWidth(shell: HTMLElement): void {
  // Same ladder as the centre target, so the width the dock sizes itself against and the
  // thing it centres on are never two different papers.
  const measureEl = resolveStudyDockCenterTarget();
  if (!(measureEl instanceof HTMLElement)) return;
  const width = measureEl.getBoundingClientRect().width;
  if (width > 0) {
    shell.style.setProperty('--proto-study-dock-paper-width-measured', `${Math.round(width)}px`);
  }
}

/**
 * Measure editor paper vs dock-track center and sync `--proto-study-dock-center-offset`
 * on `.proto-shell` for single-dock CSS transform and multi-dock scroll math.
 */
export function syncStudyDockCenterOffset(track?: HTMLElement | null): number {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 0;

  const shellEl = document.querySelector('.proto-shell');
  const shell = shellEl instanceof HTMLElement ? shellEl : null;

  const shouldMeasure =
    window.matchMedia('(min-width: 900px)').matches &&
    shell &&
    !shell.classList.contains('proto-shell--no-sidebar') &&
    !shell.classList.contains('proto-shell--sidebar-collapsed');

  if (!shouldMeasure) {
    resetStudyDockCenterOffset(shell);
    shell?.style.removeProperty('--proto-study-dock-paper-width-measured');
    return 0;
  }

  syncMeasuredPaperWidth(shell);

  const trackEl =
    track ??
    document.querySelector<HTMLElement>('.proto-shell__study-dock-layer .study-dock-carousel__track');
  const targetEl = resolveStudyDockCenterTarget();

  if (!(trackEl instanceof HTMLElement) || !targetEl) {
    resetStudyDockCenterOffset(shell);
    return 0;
  }

  const targetRect = targetEl.getBoundingClientRect();
  const trackRect = trackEl.getBoundingClientRect();
  if (targetRect.width <= 0 || trackRect.width <= 0) {
    resetStudyDockCenterOffset(shell);
    return 0;
  }

  const targetCenterX = targetRect.left + targetRect.width / 2;
  const trackCenterX = trackRect.left + trackRect.width / 2;

  const onlyItem = trackEl.querySelector('.study-dock-carousel__item:only-child');
  const cardEl =
    onlyItem instanceof HTMLElement
      ? onlyItem.querySelector('.study-dock-card__card')
      : null;

  let offsetPx: number;
  if (cardEl instanceof HTMLElement && onlyItem instanceof HTMLElement) {
    const cardRect = cardEl.getBoundingClientRect();
    const cardCenterX = cardRect.left + cardRect.width / 2;
    const appliedTranslateX = readElementTranslateX(onlyItem);
    const naturalCardCenterX = cardCenterX - appliedTranslateX;
    offsetPx = Math.round(targetCenterX - naturalCardCenterX);
    // The slot is inset to the main column (clear of the sidebar); never let the single-dock
    // shift push the card back outside that track, so it always stays fully visible.
    const maxShift = Math.max(0, (trackRect.width - cardRect.width) / 2);
    offsetPx = Math.max(-maxShift, Math.min(maxShift, offsetPx));
  } else {
    offsetPx = Math.round(targetCenterX - trackCenterX);
  }

  shell.style.setProperty('--proto-study-dock-center-offset', `${offsetPx}px`);
  return offsetPx;
}

/**
 * Measure the open document's paper edges vs the shell chrome row and sync
 * `--proto-format-toolbar-paper-inset` / `--proto-format-toolbar-paper-right-inset`
 * on `.proto-shell` for format bar host padding.
 *
 * "Paper" is whichever document is open: a note's `.proto-editor-paper` or a chapter's
 * `.pds-reader__column`. Both are the same 720px centred sheet, and the bar is inset to
 * whichever one is on screen — otherwise it spans the whole shell and stops looking like it
 * belongs to the document it is acting on.
 */
const PAPER_SELECTOR = '.proto-editor-paper, .pds-reader__column';

export function syncFormatToolbarPaperInset(): number {
  if (typeof document === 'undefined') return 0;

  const shellEl = document.querySelector('.proto-shell');
  const shell = shellEl instanceof HTMLElement ? shellEl : null;
  const paperEl = document.querySelector(PAPER_SELECTOR);
  const chromeRowEl = document.querySelector('.proto-shell__editor-chrome-row');

  if (
    !shell ||
    !(paperEl instanceof HTMLElement) ||
    !(chromeRowEl instanceof HTMLElement)
  ) {
    shell?.style.removeProperty('--proto-format-toolbar-paper-inset');
    shell?.style.removeProperty('--proto-format-toolbar-paper-right-inset');
    return 0;
  }

  const paperRect = paperEl.getBoundingClientRect();
  const chromeRowRect = chromeRowEl.getBoundingClientRect();
  const insetPx = Math.max(0, Math.round(paperRect.left - chromeRowRect.left));
  const rightInsetPx = Math.max(0, Math.round(chromeRowRect.right - paperRect.right));
  shell.style.setProperty('--proto-format-toolbar-paper-inset', `${insetPx}px`);
  shell.style.setProperty('--proto-format-toolbar-paper-right-inset', `${rightInsetPx}px`);
  return insetPx;
}

/**
 * Measure the overlay format toolbar and sync `--proto-format-toolbar-reserved-height`
 * on `document.documentElement` so the study dock layer clears the bar in format mode.
 */
export function syncFormatToolbarReservedHeight(): number {
  if (typeof document === 'undefined') return 0;

  const root = document.documentElement;
  const formatBar = document.querySelector('.proto-editor-bottom-bar[data-mode="format"]');

  if (!(formatBar instanceof HTMLElement)) {
    root.style.removeProperty('--proto-format-toolbar-reserved-height');
    return 0;
  }

  const height = Math.round(formatBar.getBoundingClientRect().height);
  if (height <= 0) {
    root.style.removeProperty('--proto-format-toolbar-reserved-height');
    return 0;
  }

  root.style.setProperty('--proto-format-toolbar-reserved-height', `${height}px`);
  return height;
}

/**
 * How much of the screen the dock band is covering, published for the page beneath it.
 *
 * The band is `position: absolute; bottom: 100%` inside a grid row that collapses to nothing,
 * so it takes **zero layout height** and floats over the main cell. That is what lets one card
 * span the sidebar and the main pane and follow the reader between routes, and it is also why
 * the last part of every scrollable surface was unreachable while a dock was expanded: nothing
 * under it knew it was there. The only height this module measured was
 * `--proto-dock-expanded-max-height`, which is a *ceiling on the card* — the opposite quantity.
 *
 * So: measure the band, write it on the root, and let each scroller reserve it in its own
 * padding. Returned as well as written, for the tests and for callers that want the number.
 *
 * Zero removes the property rather than writing `0px`, so every consumer's `var(..., 0px)`
 * fallback is the single definition of "no dock". That matters on mobile, where the band is
 * `display: none` while the keyboard is up: it reports 0, the reserve collapses, and the page
 * is not left padding for a card nobody can see.
 */
export const STUDY_DOCK_BAND_HEIGHT_VAR = '--proto-study-dock-band-height';

export function syncStudyDockBandHeight(): number {
  if (typeof document === 'undefined') return 0;
  const root = document.documentElement;
  const layer = document.querySelector('.proto-shell__study-dock-layer');
  if (!(layer instanceof HTMLElement)) {
    root.style.removeProperty(STUDY_DOCK_BAND_HEIGHT_VAR);
    return 0;
  }

  /*
   * Summed from the slots rather than read off the layer.
   *
   * The layer is `justify-content: flex-end` over a fixed area and carries 16px of top padding
   * for the card's shadow, so its own rect is the space it *may* use, not the space it is
   * using. An empty band would have reserved that padding on every route.
   */
  let height = 0;
  for (const slot of layer.children) {
    if (!(slot instanceof HTMLElement)) continue;
    const rect = slot.getBoundingClientRect();
    if (rect.height > 0) height += rect.height;
  }
  if (height > 0) {
    const gap = parseFloat(getComputedStyle(layer).rowGap) || 0;
    const filled = [...layer.children].filter(
      (slot) => slot instanceof HTMLElement && slot.getBoundingClientRect().height > 0,
    ).length;
    height += gap * Math.max(0, filled - 1);
    height += parseFloat(getComputedStyle(layer).paddingTop) || 0;
  }

  const rounded = Math.round(height);
  if (rounded <= 0) {
    root.style.removeProperty(STUDY_DOCK_BAND_HEIGHT_VAR);
    return 0;
  }
  // Written only on a change: this runs from a ResizeObserver, and setting a custom property
  // on the root invalidates style for the whole document.
  if (root.style.getPropertyValue(STUDY_DOCK_BAND_HEIGHT_VAR) !== `${rounded}px`) {
    root.style.setProperty(STUDY_DOCK_BAND_HEIGHT_VAR, `${rounded}px`);
  }
  return rounded;
}

/**
 * Keep {@link syncStudyDockBandHeight} current for as long as the band is mounted.
 *
 * Observes the layer and each slot, because a dock growing inside a slot does not change the
 * layer's own box. Bound once in `PrototypeEditorChromeBar`, which is the single mount point on
 * every route — the existing max-height effects live in `SimplifiedPrototypeLayout` behind an
 * `isNoteRoute` check, which is exactly why the Bible reader never recomputed anything.
 */
export function observeStudyDockBandHeight(layer: HTMLElement | null): () => void {
  if (!layer || typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(() => syncStudyDockBandHeight());
  observer.observe(layer);
  for (const slot of layer.children) {
    if (slot instanceof HTMLElement) observer.observe(slot);
  }
  /*
   * Slots gain and lose their cards as docks open, and a card is a new element rather than a
   * resize of an old one. Without this the observer would watch two empty slots forever.
   */
  const mutations = new MutationObserver(() => {
    for (const slot of layer.children) {
      if (slot instanceof HTMLElement) observer.observe(slot);
    }
    syncStudyDockBandHeight();
  });
  mutations.observe(layer, { childList: true, subtree: true });
  syncStudyDockBandHeight();
  return () => {
    observer.disconnect();
    mutations.disconnect();
    document.documentElement.style.removeProperty(STUDY_DOCK_BAND_HEIGHT_VAR);
  };
}

/** Recompute expanded study dock max-height and dock center offset (track required for offset). */
export function updateStudyDockExpandedMaxHeight(track?: HTMLElement | null): void {
  if (typeof document === 'undefined') return;
  if (track instanceof HTMLElement) {
    syncStudyDockCenterOffset(track);
  }
  syncFormatToolbarPaperInset();
  syncFormatToolbarReservedHeight();
  // The ceiling on the card and the room reserved beneath it are the same event.
  syncStudyDockBandHeight();
  const chromeRow = document.querySelector('.proto-shell__editor-chrome-row');
  if (!chromeRow) return;
  const rect = chromeRow.getBoundingClientRect();
  const available = Math.round(rect.top - 16);
  if (available > 0) {
    document.documentElement.style.setProperty(
      '--proto-dock-expanded-max-height',
      `${Math.max(180, available)}px`,
    );
  }
}
