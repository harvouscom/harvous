import { useEffect, useRef } from 'react';
import type { PrototypeHomePresentationReadyInput } from '@/utils/prototype-home-ready';

/**
 * DEV-only: how long Home waited, and what it was waiting on.
 *
 * Home presents once, when every query it renders from has settled, with a 2.5s deadline
 * behind that as a backstop. Both halves fail quietly. If a flag never flips — a query
 * disabled for this account, say — the gate never fires and every cold load silently pays
 * the full deadline instead; the reader just sees dots for two and a half seconds and has
 * no way to tell that from a slow network. That is exactly the bug this was written to
 * find (`churchSermonsSettled`, which stayed false forever for anyone without a church).
 *
 * So the trace reports the number *and* the reason: `gate` means readiness fired, and
 * `deadline` names the flags that were still false when the backstop gave up.
 */
export function useHomeSettleTrace(
  input: PrototypeHomePresentationReadyInput,
  contentReady: boolean,
  presentationReady: boolean,
): void {
  // The clock starts when the view first mounts, which is the first frame the reader sees dots.
  const startedAtRef = useRef<number | null>(null);
  const reportedRef = useRef(false);
  /** When each flag first went true, so the report can name the long pole rather than guess. */
  const settledAtRef = useRef<Map<string, number>>(new Map());
  // Read through a ref so the effect depends only on the two booleans: the input object is a
  // fresh literal every render, and a dependency on it would re-run this every commit.
  const inputRef = useRef(input);
  inputRef.current = input;

  if (import.meta.env.DEV && startedAtRef.current === null) {
    startedAtRef.current = performance.now();
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const now = performance.now();
    for (const [flag, settled] of Object.entries(inputRef.current)) {
      if (settled && !settledAtRef.current.has(flag)) settledAtRef.current.set(flag, now);
    }
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!contentReady || reportedRef.current) return;
    reportedRef.current = true;

    const startedAt = startedAtRef.current ?? performance.now();
    const elapsed = Math.round(performance.now() - startedAt);
    const unsettled = Object.entries(inputRef.current)
      .filter(([, settled]) => !settled)
      .map(([flag]) => flag);

    const slowest = [...settledAtRef.current.entries()]
      .map(([flag, at]) => `${flag} ${Math.round(at - startedAt)}ms`)
      .slice(-4)
      .join(', ');

    if (presentationReady) {
      console.info(`[home] settled via gate in ${elapsed}ms — last to land: ${slowest}`);
    } else {
      console.warn(
        `[home] settled via DEADLINE in ${elapsed}ms — still waiting on: ${unsettled.join(', ') || '(none)'} — last to land: ${slowest}`,
      );
    }
  }, [contentReady, presentationReady]);
}
