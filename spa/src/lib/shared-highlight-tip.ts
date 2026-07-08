const SHARED_HIGHLIGHT_TIP_KEY = 'harvous-shared-highlight-tip-seen';

export function hasSeenSharedHighlightTip(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(SHARED_HIGHLIGHT_TIP_KEY) === '1';
  } catch {
    return true;
  }
}

export function markSharedHighlightTipSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHARED_HIGHLIGHT_TIP_KEY, '1');
  } catch {
    /* ignore */
  }
}
