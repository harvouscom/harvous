/**
 * Focus movement for prototype sidebar list rows (Shift+↑/↓ via global shortcut).
 *
 * Covers note/highlight rows (`button.proto-note-row__main`), folder drill rows
 * (`button.proto-note-row`), and 2-up collection grids (`button.proto-collection-card`).
 */

export const SIDEBAR_LIST_ROW_SELECTOR =
  'button.proto-note-row__main, button.proto-note-row, button.proto-collection-card';

export type MoveListRowFocusOptions = {
  rowSelector?: string;
  wrap?: boolean;
  jump?: 'home' | 'end';
};

function keyboardFocusMarkerFor(control: HTMLElement): HTMLElement {
  const marked =
    control.closest('.proto-note-row-item') ??
    control.closest('.proto-collection-grid > li') ??
    control.closest('.proto-note-list > li');
  return (marked ?? control) as HTMLElement;
}

function clearKeyboardFocusMarkers(container: HTMLElement): void {
  container.querySelectorAll('[data-keyboard-focus="true"]').forEach((el) => {
    el.removeAttribute('data-keyboard-focus');
  });
}

function focusListControl(
  control: HTMLElement,
  container: HTMLElement,
  index: number,
  total: number,
): void {
  clearKeyboardFocusMarkers(container);
  keyboardFocusMarkerFor(control).setAttribute('data-keyboard-focus', 'true');
  control.focus({ focusVisible: true });
  // Edge rows sit flush against the scrollport; center them so the full row chrome is visible.
  const atScrollEdge = index === 0 || index === total - 1;
  control.scrollIntoView({ block: atScrollEdge ? 'center' : 'nearest' });
}

/** Move roving focus among list rows inside `container`. Returns false when no rows match. */
export function moveListRowFocus(
  container: HTMLElement,
  step: number,
  options?: MoveListRowFocusOptions,
): boolean {
  const rowSelector = options?.rowSelector ?? SIDEBAR_LIST_ROW_SELECTOR;
  const wrap = options?.wrap ?? false;

  const rows = Array.from(container.querySelectorAll<HTMLElement>(rowSelector));
  if (rows.length === 0) return false;

  const active = document.activeElement;
  const currentIndex =
    active instanceof HTMLElement && active.matches(rowSelector) ? rows.indexOf(active) : -1;

  let nextIndex: number;
  if (options?.jump === 'home') nextIndex = 0;
  else if (options?.jump === 'end') nextIndex = rows.length - 1;
  else if (currentIndex === -1) nextIndex = step > 0 ? 0 : rows.length - 1;
  else {
    nextIndex = currentIndex + step;
    if (nextIndex < 0) nextIndex = wrap ? rows.length - 1 : 0;
    else if (nextIndex >= rows.length) nextIndex = wrap ? 0 : rows.length - 1;
  }

  const next = rows[nextIndex];
  if (!next) return false;

  focusListControl(next, container, nextIndex, rows.length);
  return true;
}
