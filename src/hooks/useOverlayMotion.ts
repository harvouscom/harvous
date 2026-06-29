import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_EXIT_MS = 220;

function overlayMotionMs(exitMs?: number): number {
  const ms = exitMs ?? DEFAULT_EXIT_MS;
  if (typeof window === 'undefined') return ms;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}

/** Keeps a portaled overlay mounted during exit so CSS can play before unmount. */
export function useOverlayMotion(open: boolean, options?: { exitMs?: number }) {
  const exitMs = options?.exitMs;
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
    }, overlayMotionMs(exitMs));
  }, [open, mounted, clearExitTimer, exitMs]);

  useEffect(() => () => clearExitTimer(), [clearExitTimer]);

  return { mounted, exiting };
}
