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

/** Recompute expanded study dock max-height from the editor chrome row position. */
export function updateStudyDockExpandedMaxHeight(): void {
  if (typeof document === 'undefined') return;
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
