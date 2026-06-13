import { useCallback, useEffect, useRef, useState } from 'react';
import { PROTO_VOTD_SHEET_MOTION_MS } from '../layouts/proto-motion';

function overlayMotionMs(): number {
  if (typeof window === 'undefined') return PROTO_VOTD_SHEET_MOTION_MS;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : PROTO_VOTD_SHEET_MOTION_MS;
}

/**
 * Keeps a portaled overlay + dialog mounted during exit so CSS can play before unmount.
 * Driven by the parent's `open` prop — no API change required at call sites.
 */
export function useProtoOverlayMotion(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitStartedRef = useRef(false);

  const clearExitTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (open) {
      clearExitTimer();
      exitStartedRef.current = false;
      setMounted(true);
      setExiting(false);
      return;
    }

    if (!mounted || exitStartedRef.current) return;

    exitStartedRef.current = true;
    setExiting(true);
    timerRef.current = setTimeout(() => {
      setMounted(false);
      setExiting(false);
      exitStartedRef.current = false;
      timerRef.current = null;
    }, overlayMotionMs());
  }, [open, mounted, clearExitTimer]);

  useEffect(() => () => clearExitTimer(), [clearExitTimer]);

  return { mounted, exiting };
}
