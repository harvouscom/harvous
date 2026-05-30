import { useEffect, useRef, useState } from 'react';
import { PROTOTYPE_SHIFT_HINT_HOLD_MS } from '@/utils/keyboard-shortcuts';

/**
 * True after Shift is held alone briefly — shows toolbar key hints without blocking
 * Shift+letter typing in the editor (quick Shift+key cancels the timer).
 */
export function usePrototypeShiftHints(): boolean {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    const clearHints = () => {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      activeRef.current = false;
      setActive(false);
      delete document.documentElement.dataset.shiftHints;
    };

    const showHints = () => {
      activeRef.current = true;
      setActive(true);
      document.documentElement.dataset.shiftHints = '1';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(showHints, PROTOTYPE_SHIFT_HINT_HOLD_MS);
        return;
      }

      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (activeRef.current && e.key !== 'Shift') {
        clearHints();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        clearHints();
      }
    };

    const onBlur = () => {
      clearHints();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      clearHints();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return active;
}
