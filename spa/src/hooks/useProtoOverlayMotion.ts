import { useCallback, useEffect, useRef, useState } from 'react';
import { PROTO_VOTD_SHEET_MOTION_MS } from '../layouts/proto-motion';
import { playSound } from '@/utils/sounds';

function overlayMotionMs(exitMs?: number): number {
  const ms = exitMs ?? PROTO_VOTD_SHEET_MOTION_MS;
  if (typeof window === 'undefined') return ms;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}

/**
 * Keeps a portaled overlay + dialog mounted during exit so CSS can play before unmount.
 * Driven by the parent's `open` prop — no API change required at call sites.
 */
export function useProtoOverlayMotion(open: boolean, options?: { exitMs?: number }) {
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

  /*
   * The panel voice of a sheet opening and falling shut, for every sheet that moves through here.
   *
   * On a change of `open` only: a sheet that mounts already open was not opened by anyone just
   * now, and StrictMode's second run of this effect sees no change. Sheets that open by
   * themselves — a welcome, a letter — have no gesture behind them, and the sound layer drops
   * those.
   */
  const soundedOpenRef = useRef(open);
  useEffect(() => {
    if (open === soundedOpenRef.current) return;
    soundedOpenRef.current = open;
    playSound(open ? 'panel.open' : 'panel.close');
  }, [open]);

  return { mounted, exiting };
}
