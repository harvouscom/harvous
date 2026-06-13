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

function resolveStudyDockCenterTarget(): HTMLElement | null {
  const paper = document.querySelector('.proto-editor-paper');
  if (paper instanceof HTMLElement) return paper;

  const wrap = document.querySelector('.proto-editor-content-wrap');
  if (wrap instanceof HTMLElement) return wrap;

  const surface = document.querySelector('.proto-editor-surface');
  if (surface instanceof HTMLElement) return surface;

  const mainCell = document.querySelector('.proto-shell__main-cell');
  if (mainCell instanceof HTMLElement) return mainCell;

  return null;
}

function syncMeasuredPaperWidth(shell: HTMLElement): void {
  const paper = document.querySelector('.proto-editor-paper');
  const measureEl =
    paper instanceof HTMLElement
      ? paper
      : document.querySelector('.proto-editor-content-wrap');
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
  } else {
    offsetPx = Math.round(targetCenterX - trackCenterX);
  }

  shell.style.setProperty('--proto-study-dock-center-offset', `${offsetPx}px`);
  return offsetPx;
}

/** Recompute expanded study dock max-height and dock center offset (track required for offset). */
export function updateStudyDockExpandedMaxHeight(track?: HTMLElement | null): void {
  if (typeof document === 'undefined') return;
  if (track instanceof HTMLElement) {
    syncStudyDockCenterOffset(track);
  }
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
