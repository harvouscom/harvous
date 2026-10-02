/**
 * The free history window's weekly reminder: a persistent toast, at most once a week, and only
 * while something is actually in its last week of view.
 *
 * Shaped like guest mode's exit prompt (one sentence, one action) rather than a modal, and held
 * back a few seconds after load so it never lands on top of the first paint. The Review upsell
 * is deliberately ask-once; this is the one Plus reminder that repeats, and it earns that only
 * because each time it carries a new fact — a different batch, a real countdown.
 */
import { useEffect } from 'react';
import { showPrototypeFeedbackToast } from '@/utils/prototype-feedback-toast';
import { leavingToastMessage } from '../lib/history-window-copy';
import { useHistoryWindowStatus } from './queries/useHistoryWindowStatus';

const LAST_SHOWN_KEY = 'harvous-history-reminder-at';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DELAY_MS = 8_000;

export function shouldShowHistoryReminder(lastShownAt: string | null, now: number): boolean {
  if (!lastShownAt) return true;
  const last = Number(lastShownAt);
  return !Number.isFinite(last) || now - last >= WEEK_MS;
}

export function useHistoryWindowReminder(): void {
  const { status } = useHistoryWindowStatus();
  const leaving = status?.leavingSoon ?? null;

  useEffect(() => {
    if (!leaving) return;
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(LAST_SHOWN_KEY);
    } catch {
      // Storage blocked: without a way to remember, staying quiet is kinder than asking every visit.
      return;
    }
    if (!shouldShowHistoryReminder(last, Date.now())) return;

    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
      } catch {
        return;
      }
      showPrototypeFeedbackToast(leavingToastMessage(leaving), 'info', {
        persistent: true,
        action: {
          label: 'See Plus',
          onAction: () => {
            try {
              sessionStorage.setItem('harvousSkipBeforeUnload', 'upgrade');
            } catch {
              /* ignore */
            }
            window.location.assign('/upgrade');
          },
        },
      });
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);
}
