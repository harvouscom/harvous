/**
 * Whether the primary pointer is coarse (finger) rather than fine (mouse).
 *
 * Reactive rather than read-once: an iPad gaining or losing a trackpad flips
 * this live, and a drag affordance that appears only for mice should appear the
 * moment a mouse does.
 *
 * The prototype sheets each inline `window.matchMedia('(pointer: coarse)')`
 * combined with `isMobileSidebar` to choose sheet-vs-popover presentation. This
 * is the same signal on its own, for code that cares about the input device and
 * not the layout.
 */
import { useSyncExternalStore } from 'react';

const QUERY = '(pointer: coarse)';

function query(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

function subscribe(onChange: () => void): () => void {
  const mql = query();
  if (!mql) return () => {};
  // Safari <14 only has the deprecated listener API.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}

function getSnapshot(): boolean {
  return query()?.matches ?? false;
}

/** Server render assumes a mouse — the desktop affordance is the safe default. */
function getServerSnapshot(): boolean {
  return false;
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
