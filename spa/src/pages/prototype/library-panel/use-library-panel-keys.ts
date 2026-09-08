/**
 * The panel's keyboard layer: walk the list, open what you land on.
 *
 * The same chords the sidebar's lists answer — ⇧↑/⇧↓ to move, ⇧J to drop into the list —
 * because the panel took over that job and a reader who learned them in the rail should not
 * have to learn them again. Tab switching (⇧← / ⇧→) is wired in the shell's shortcut bridge
 * alongside the sidebar's own mode cycling, since it has to choose between the two.
 *
 * Opening needs nothing: every row is a real `<button>`, so Enter and Space already fire it.
 * That is the reason the rows are buttons rather than divs with click handlers, and it is
 * worth not undoing.
 */
import { useEffect } from 'react';
import { moveListRowFocus } from '../../../hooks/useListKeyboardNavigation';

export function useLibraryPanelKeys(bodyRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onMove = (event: Event) => {
      const container = bodyRef.current;
      if (!container) return;
      const step = (event as CustomEvent<{ step?: number }>).detail?.step ?? 1;
      moveListRowFocus(container, step, { wrap: true });
    };

    /*
     * ⇧J drops into the list from wherever you are — including the search field, which is
     * where the panel put you. Without it the only way out of the field is the mouse.
     */
    const onFocusList = () => {
      const container = bodyRef.current;
      if (!container) return;
      moveListRowFocus(container, 1, { jump: 'home' });
    };

    window.addEventListener('prototypeShortcutMoveInList', onMove);
    window.addEventListener('prototypeShortcutFocusNoteList', onFocusList);
    return () => {
      window.removeEventListener('prototypeShortcutMoveInList', onMove);
      window.removeEventListener('prototypeShortcutFocusNoteList', onFocusList);
    };
  }, [bodyRef]);
}
