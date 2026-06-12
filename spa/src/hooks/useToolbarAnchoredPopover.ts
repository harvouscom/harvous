import { useCallback, useEffect, useRef, useState } from 'react';
import { PROTO_POPOVER_MOTION_MS } from '../layouts/proto-motion';

function popoverMotionMs(): number {
  if (typeof window === 'undefined') return PROTO_POPOVER_MOTION_MS;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PROTO_POPOVER_MOTION_MS;
}

/**
 * Open/close state for a portaled toolbar popover with animated dismiss.
 * Keeps the popover mounted during exit so CSS can play before unmount.
 */
export function useToolbarAnchoredPopover() {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExitTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const openFrom = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      clearExitTimer();
      setExiting(false);
      setAnchorRect(el.getBoundingClientRect());
    },
    [clearExitTimer],
  );

  const dismiss = useCallback(() => {
    if (!anchorRect || exiting) return;
    setExiting(true);
    timerRef.current = setTimeout(() => {
      setAnchorRect(null);
      setExiting(false);
      timerRef.current = null;
    }, popoverMotionMs());
  }, [anchorRect, exiting]);

  const toggleFrom = useCallback(
    (el: HTMLElement | null) => {
      if (anchorRect) {
        dismiss();
      } else {
        openFrom(el);
      }
    },
    [anchorRect, dismiss, openFrom],
  );

  useEffect(() => () => clearExitTimer(), [clearExitTimer]);

  return {
    anchorRect,
    exiting,
    isOpen: anchorRect != null,
    openFrom,
    dismiss,
    toggleFrom,
  };
}
