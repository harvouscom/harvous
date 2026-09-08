import { useEffect, useRef } from 'react';
import type { PrototypeHomePresentationReadyInput } from '@/utils/prototype-home-ready';

/** Where the opt-in is remembered. Session-scoped on purpose — see `resolveHomeSettleTrace`. */
export const HOME_SETTLE_TRACE_KEY = 'harvous-debug-home-settle';

/**
 * What `?debug=home` should do, given the URL and whether the trace is already armed.
 *
 * Split out as a pure function because the interesting part is the three-way decision, and the
 * rest is `window` plumbing that a test would only be mocking.
 */
export function homeSettleTraceDecision(
  search: string,
  armed: boolean,
): { enabled: boolean; arm: boolean; disarm: boolean } {
  const param = new URLSearchParams(search).get('debug');
  if (param === 'off') return { enabled: false, arm: false, disarm: true };
  if (param === 'home') return { enabled: true, arm: true, disarm: false };
  return { enabled: armed, arm: false, disarm: false };
}

/**
 * Whether to trace this load: always in dev, and in production once asked.
 *
 * Armed in `sessionStorage` rather than `localStorage`, which is the whole design of the opt-in.
 * The trace reports on the *first* settle of a load, so checking it means reloading a few times —
 * a flag that died with the URL would be useless, and one that outlived the tab would be a
 * diagnostic left switched on in someone's browser forever. A tab's lifetime is exactly the
 * length of the question.
 */
export function resolveHomeSettleTrace(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  try {
    const armed = window.sessionStorage.getItem(HOME_SETTLE_TRACE_KEY) === '1';
    const { enabled, arm, disarm } = homeSettleTraceDecision(window.location.search, armed);
    if (arm) window.sessionStorage.setItem(HOME_SETTLE_TRACE_KEY, '1');
    if (disarm) window.sessionStorage.removeItem(HOME_SETTLE_TRACE_KEY);
    return enabled;
  } catch {
    // Private windows and blocked site data throw on access. No trace is the right answer.
    return false;
  }
}

/**
 * How long Home waited, and what it was waiting on.
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
 *
 * **Dev always, production on request.** It was dev-only, which meant the one environment whose
 * answer actually matters could never be asked: the gate's whole job is to beat a 2.5s deadline
 * against real latency, and a dev machine with its own database pool is not that. Load any page
 * with `?debug=home` to arm it for the tab and `?debug=off` to stop. Flag names and millisecond
 * counts only — nothing about what is being studied.
 */
export function useHomeSettleTrace(
  input: PrototypeHomePresentationReadyInput,
  contentReady: boolean,
  presentationReady: boolean,
): void {
  /* Resolved once per mount and held, so a client-side navigation that drops the query parameter
     cannot switch the trace off halfway through the load it is reporting on. */
  const enabledRef = useRef<boolean | null>(null);
  if (enabledRef.current === null) enabledRef.current = resolveHomeSettleTrace();
  const enabled = enabledRef.current;

  // The clock starts when the view first mounts, which is the first frame the reader sees dots.
  const startedAtRef = useRef<number | null>(null);
  const reportedRef = useRef(false);
  /** When each flag first went true, so the report can name the long pole rather than guess. */
  const settledAtRef = useRef<Map<string, number>>(new Map());
  // Read through a ref so the effect depends only on the two booleans: the input object is a
  // fresh literal every render, and a dependency on it would re-run this every commit.
  const inputRef = useRef(input);
  inputRef.current = input;

  if (enabled && startedAtRef.current === null) {
    startedAtRef.current = performance.now();
  }

  useEffect(() => {
    if (!enabled) return;
    const now = performance.now();
    for (const [flag, settled] of Object.entries(inputRef.current)) {
      if (settled && !settledAtRef.current.has(flag)) settledAtRef.current.set(flag, now);
    }
  });

  useEffect(() => {
    if (!enabled) return;
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

    /* Only outside dev, where the reader asked for this and needs to know how to stop. */
    const off = import.meta.env.DEV ? '' : ' — ?debug=off to stop';

    if (presentationReady) {
      console.info(`[home] settled via gate in ${elapsed}ms — last to land: ${slowest}${off}`);
    } else {
      console.warn(
        `[home] settled via DEADLINE in ${elapsed}ms — still waiting on: ${unsettled.join(', ') || '(none)'} — last to land: ${slowest}${off}`,
      );
    }
  }, [contentReady, presentationReady, enabled]);
}
