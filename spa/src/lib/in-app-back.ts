import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { isPrototypeNotePath, isPrototypeReadPath } from '@/lib/prototype-path';

declare module '@tanstack/history' {
  interface HistoryState {
    /** Set on entries the Activity / Note / Bible switch pushed. See `SHELL_SWITCH_STATE`. */
    shellSwitch?: true;
  }
}

/**
 * Going back, in an app that has no back button.
 *
 * An installed iPhone web app gets no browser chrome and no Safari edge swipe, so a note
 * opened from another note had no way back except the mode switcher, which lands on Home or
 * the reader rather than where you were. Two answers share this module: a left-edge swipe
 * (installed app only) and a toolbar back chevron when the previous page was a document.
 *
 * Depth comes from TanStack Router's own entry index (`history.state.__TSR_index`), so
 * "back" never leaves the app. What the previous entry *was* is recorded here, per index,
 * as the router lands on each one.
 */

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Touches that start this close to the left edge belong to the swipe-back gesture. */
export const EDGE_SWIPE_ZONE_PX = 20;
const EDGE_SWIPE_COMMIT_PX = 60;
const STORE_KEY = 'harvous-in-app-history';

type Entry = { index: number; path: string };

/**
 * History state for a navigation made by the Activity / Note / Bible switch.
 *
 * The three halves are where you are, not somewhere you went into, so an entry one of them
 * pushed shows no chevron even when the page behind it was a note or a chapter: Bible then
 * Home is a change of view, and a back arrow there read as "you are inside the reader".
 * The entry is still a real push, so the browser's own back keeps working. Pass it as
 * `navigate({ ..., state: SHELL_SWITCH_STATE })`.
 */
export const SHELL_SWITCH_STATE = { shellSwitch: true } as const;

function entryIndex(): number {
  if (typeof window === 'undefined') return 0;
  const state = window.history.state as { __TSR_index?: number } | null;
  return typeof state?.__TSR_index === 'number' ? state.__TSR_index : 0;
}

function arrivedBySwitch(): boolean {
  if (typeof window === 'undefined') return false;
  return (window.history.state as { shellSwitch?: boolean } | null)?.shellSwitch === true;
}

function readPaths(): Record<number, string> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}') as Record<number, string>;
  } catch {
    return {};
  }
}

/** Record the path at the current history index. Call on every resolved location. */
export function recordInAppLocation(path: string): void {
  try {
    const paths = readPaths();
    const index = entryIndex();
    paths[index] = path;
    // Entries past this one were abandoned by a new push.
    for (const key of Object.keys(paths)) if (Number(key) > index) delete paths[Number(key)];
    sessionStorage.setItem(STORE_KEY, JSON.stringify(paths));
  } catch {
    /* private mode: the chevron just doesn't show */
  }
}

export function canGoBackInApp(): boolean {
  return entryIndex() > 0;
}

/** The previous in-app entry, when it was a note or a chapter other than this page. */
export function previousDocumentEntry(currentPath: string): Entry | null {
  const index = entryIndex();
  if (index <= 0 || arrivedBySwitch()) return null;
  const path = readPaths()[index - 1];
  if (!path || path === currentPath) return null;
  const pathname = path.split('?')[0] ?? path;
  if (!isPrototypeNotePath(pathname) && !isPrototypeReadPath(pathname)) return null;
  return { index: index - 1, path };
}

/** Back chevron state for the toolbar: shown when there's a document to go back to. */
export function useInAppBackTarget(currentPath: string): Entry | null {
  const [target, setTarget] = useState<Entry | null>(null);
  /* The entry, not just the path: compose pushes `/` over `/`, a new entry with no new path. */
  const index = useRouterState({ select: (s) => s.location.state.__TSR_index });
  useEffect(() => {
    recordInAppLocation(currentPath);
    setTarget(previousDocumentEntry(currentPath));
  }, [currentPath, index]);
  return target;
}

/**
 * Left-edge swipe to go back, in the installed iOS app only (`html.ios-pwa`). A touch that
 * starts within 20px of the edge and travels 60px right, more across than down, calls
 * `history.back()` when there is an in-app entry to go back to. The main pane follows the
 * finger a little so the gesture reads as working, except under reduced motion.
 */
export function useStandaloneEdgeSwipeBack(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    let start: { x: number; y: number } | null = null;
    let pane: HTMLElement | null = null;

    const resetNudge = () => {
      if (pane) {
        pane.style.removeProperty('translate');
        pane.style.removeProperty('transition');
      }
      pane = null;
    };

    const onStart = (e: TouchEvent) => {
      start = null;
      if (!root.classList.contains('ios-pwa') || e.touches.length !== 1 || !canGoBackInApp()) return;
      const t = e.touches[0]!;
      if (t.clientX > EDGE_SWIPE_ZONE_PX) return;
      start = { x: t.clientX, y: t.clientY };
    };

    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      if (dy > 24 && dy > dx) {
        // A scroll that happened to start at the edge.
        start = null;
        resetNudge();
        return;
      }
      if (dx > 0 && !prefersReducedMotion()) {
        pane ??= document.querySelector<HTMLElement>('.proto-shell__main-cell');
        if (pane) {
          pane.style.transition = 'none';
          pane.style.translate = `${Math.min(dx * 0.25, 28)}px 0`;
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      const began = start;
      start = null;
      const t = e.changedTouches[0];
      if (pane) {
        pane.style.transition = 'translate 180ms ease-out';
        pane.style.translate = '0 0';
        const p = pane;
        window.setTimeout(() => {
          p.style.removeProperty('translate');
          p.style.removeProperty('transition');
        }, 200);
        pane = null;
      }
      if (!began || !t) return;
      const dx = t.clientX - began.x;
      const dy = Math.abs(t.clientY - began.y);
      if (dx >= EDGE_SWIPE_COMMIT_PX && dx > dy && canGoBackInApp()) window.history.back();
    };

    const onCancel = () => {
      start = null;
      resetNudge();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      resetNudge();
    };
  }, []);
}
