import { useSyncExternalStore } from 'react';
import { todayCalendarDayKey } from '../lib/votd-today';

/**
 * Today's local calendar day (YYYY-MM-DD), re-rendering when it changes.
 *
 * Nothing in React notices midnight. An installed app is suspended overnight and resumed in the
 * morning with yesterday's renders intact, so anything keyed on "today" has to be told: a timer
 * for the tab that stays awake across midnight, and visibility/focus/pageshow for the one that
 * was asleep through it (timers do not fire on schedule in a suspended page).
 */
function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    /* Capped so a clock or time-zone change is caught within the hour rather than tomorrow. */
    timer = setTimeout(tick, Math.min(next.getTime() - now.getTime(), 60 * 60 * 1000));
  };
  const tick = () => {
    onChange();
    schedule();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') tick();
  };
  schedule();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', tick);
  window.addEventListener('pageshow', tick);
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', tick);
    window.removeEventListener('pageshow', tick);
  };
}

export function useLocalDay(): string {
  return useSyncExternalStore(subscribe, todayCalendarDayKey, todayCalendarDayKey);
}
