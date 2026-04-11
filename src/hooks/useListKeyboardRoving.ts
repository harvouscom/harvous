import { type RefObject, useEffect } from 'react';

/**
 * Arrow Up/Down moves focus between primary row links when focus is inside the container.
 * Rows are marked with [data-keyboard-row]; each row should expose one main `a[href]`.
 */
export function useListKeyboardRoving(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getRowLinks = (): HTMLAnchorElement[] => {
      return Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-keyboard-row] a[href]')).filter((a) => {
        const href = a.getAttribute('href');
        return href != null && href !== '' && href !== '#';
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (!el.contains(event.target as Node)) return;

      const links = getRowLinks();
      if (links.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      let idx = links.indexOf(active as HTMLAnchorElement);
      if (idx < 0 && active) {
        const row = active.closest('[data-keyboard-row]');
        if (row) {
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

    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [containerRef]);
}
