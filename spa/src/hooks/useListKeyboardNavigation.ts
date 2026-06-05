import { useEffect, type RefObject } from 'react';

/**
 * Roving keyboard navigation for a vertical list of focusable rows.
 *
 * Power users focus the list (e.g. Shift+J) and then move with Arrow keys (or j/k,
 * vim-style) and Home/End; Enter/Space open the focused row via its native button.
 * Only fires when a matching row already has focus, so j/k never hijack typing in a
 * search field or anywhere else.
 *
 * Works across every list mode in the sidebar because all primary row actions share
 * the same classes (`button.proto-note-row__main` for notes/highlights,
 * `button.proto-note-row` for folders).
 */
const DEFAULT_ROW_SELECTOR = 'button.proto-note-row__main, button.proto-note-row';

export function useListKeyboardNavigation(
  containerRef: RefObject<HTMLElement | null>,
  options?: { rowSelector?: string; wrap?: boolean; enabled?: boolean },
): void {
  const rowSelector = options?.rowSelector ?? DEFAULT_ROW_SELECTOR;
  const wrap = options?.wrap ?? false;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      const { key } = event;
      const isDown = key === 'ArrowDown' || key === 'j';
      const isUp = key === 'ArrowUp' || key === 'k';
      const isHome = key === 'Home';
      const isEnd = key === 'End';
      if (!isDown && !isUp && !isHome && !isEnd) return;

      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.matches(rowSelector)) return;

      // Sidebar renders only the active list mode, so mounted rows are the visible rows.
      const rows = Array.from(container.querySelectorAll<HTMLElement>(rowSelector));
      if (rows.length === 0) return;

      const currentIndex = rows.indexOf(active);
      if (currentIndex === -1) return;

      let nextIndex: number;
      if (isHome) nextIndex = 0;
      else if (isEnd) nextIndex = rows.length - 1;
      else if (isDown) nextIndex = currentIndex + 1;
      else nextIndex = currentIndex - 1;

      if (nextIndex < 0) nextIndex = wrap ? rows.length - 1 : 0;
      else if (nextIndex >= rows.length) nextIndex = wrap ? 0 : rows.length - 1;

      // Consume the key even at the ends so the scroll container does not jump.
      event.preventDefault();

      const next = rows[nextIndex];
      if (next && next !== active) {
        next.focus();
        next.scrollIntoView({ block: 'nearest' });
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [containerRef, rowSelector, wrap, enabled]);
}
