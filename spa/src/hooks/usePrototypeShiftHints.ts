import { useEffect, useSyncExternalStore } from 'react';
import { PROTOTYPE_SHIFT_HINT_HOLD_MS } from '@/utils/keyboard-shortcuts';

/** Shared across all toolbar instances so hints survive Shift+shortcut chords and late-mounting sidebar chrome. */
let active = false;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
let listenersAttached = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function setActiveState(next: boolean) {
  if (active === next) return;
  active = next;
  if (next) {
    document.documentElement.dataset.shiftHints = '1';
  } else {
    delete document.documentElement.dataset.shiftHints;
  }
  emit();
}

function clearHints() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  setActiveState(false);
}

function showHints() {
  setActiveState(true);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return active;
}

function getServerSnapshot() {
  return false;
}

function ensureListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;

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

    // Keep hints visible while Shift stays held (e.g. Shift+S opens sidebar mid-hold).
    if (active && e.key !== 'Shift' && !e.shiftKey) {
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
}

/**
 * True after Shift is held alone briefly — shows toolbar key hints without blocking
 * Shift+letter typing in the editor (quick Shift+key cancels the timer).
 */
export function usePrototypeShiftHints(): boolean {
  useEffect(() => {
    ensureListeners();
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
