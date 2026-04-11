import { type RefObject, useEffect } from 'react';
import { isTypingInInput } from '@/utils/keyboard-shortcuts';

/**
 * Arrow Up/Down moves focus between primary row links.
 * Rows are marked with [data-keyboard-row]; each row should expose one main `a[href]`.
 *
 * Uses a window capture listener so keys work when focus is on document.body (not only when
 * focus is already inside the list container, which bubble-phase listeners miss).
 */
export function useListKeyboardRoving(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const getRowLinks = (root: HTMLElement): HTMLAnchorElement[] => {
      return Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-keyboard-row] a[href]')).filter((a) => {
        const href = a.getAttribute('href');
        return href != null && href !== '' && href !== '#';
      });
    };

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingInInput()) return;

      const el = containerRef.current;
      if (!el) return;

      const links = getRowLinks(el);
      if (links.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const activeInList = active != null && el.contains(active);
      const isBodyOrHtml = active === document.body || active === document.documentElement;

      if (!activeInList && !isBodyOrHtml) return;

      if (!activeInList && isBodyOrHtml) {
        event.preventDefault();
        const target = event.key === 'ArrowDown' ? links[0] : links[links.length - 1];
        target.focus();
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }

      let idx = links.indexOf(active as HTMLAnchorElement);
      if (idx < 0 && active) {
        const row = active.closest('[data-keyboard-row]');
        if (row && el.contains(row)) {
          const link = row.querySelector<HTMLAnchorElement>('a[href]');
          if (link && links.includes(link)) idx = links.indexOf(link);
        }
      }
      if (idx < 0) {
        idx = event.key === 'ArrowDown' ? -1 : links.length;
      }

      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = (idx + delta + links.length) % links.length;
      const target = links[next];
      target.focus();
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    window.addEventListener('keydown', onWindowKeyDown, true);
    return () => window.removeEventListener('keydown', onWindowKeyDown, true);
  }, [containerRef]);
}
