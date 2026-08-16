import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PANE_DOCK_MIN_WIDTH } from './proto-inspector-layout';

/** The real main pane — never the settings keep-alive twin beside it. */
const MAIN_PANE_SELECTOR =
  '.proto-shell__main-inner:not(.proto-shell__main-inner--settings-keep)';

/**
 * Is the shell's main pane wide enough to seat a document beside the inspector?
 *
 * Docking reserves the inspector's width as padding on that pane, so both paper-stack
 * layers shift together (see `.proto-shell__main-inner` in `prototype-shell.css`). That
 * makes the measurement subtle in two ways, which is why it lives here rather than being
 * written twice:
 *
 * - It measures the PANE, not the document inside it. The document shrinks by exactly the
 *   reserve when the inspector docks, so measuring the document would make "wide enough"
 *   depend on its own answer — a pane on the threshold would dock, shrink under it, undock,
 *   widen, and dock again without end.
 * - It measures the BORDER box, which padding does not move. `contentRect` is the content
 *   box, and would reintroduce the same loop.
 *
 * A real element via ResizeObserver rather than a viewport media query, because in the
 * native webview CSS px and visible px are not the same thing.
 */
export function useShellPaneIsWide(): boolean {
  const [isWide, setIsWide] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  const sync = useCallback((width: number) => {
    setIsWide(width >= PANE_DOCK_MIN_WIDTH);
  }, []);

  useLayoutEffect(() => {
    const pane = document.querySelector(MAIN_PANE_SELECTOR);
    if (!pane) return;
    sync(pane.getBoundingClientRect().width);
  }, [sync]);

  useEffect(() => {
    const pane = document.querySelector(MAIN_PANE_SELECTOR);
    if (!pane || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const border = entry.borderBoxSize?.[0];
        sync(border ? border.inlineSize : entry.contentRect.width);
      }
    });
    ro.observe(pane);
    observerRef.current = ro;
    return () => {
      ro.disconnect();
      observerRef.current = null;
    };
  }, [sync]);

  return isWide;
}
