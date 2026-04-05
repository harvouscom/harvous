export const REDUCE_MOTION_STORAGE_KEY = 'harvous-reduce-motion';

/** In-app Reduce Motion (My Preferences) is off until motion handling is refined. */
export const REDUCE_MOTION_APP_PREFERENCE_ENABLED = false;

export function readReduceMotionFromStorage(): boolean {
  try {
    return localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeReduceMotionToStorage(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(REDUCE_MOTION_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * When {@link REDUCE_MOTION_APP_PREFERENCE_ENABLED} is true: syncs
 * `<html data-reduce-motion="true">` from localStorage.
 * When false: always clears that attribute (ignores storage) so a prior session cannot leave it on.
 */
export function syncReduceMotionFromStorage(): void {
  if (typeof document === 'undefined') return;
  if (!REDUCE_MOTION_APP_PREFERENCE_ENABLED) {
    document.documentElement.removeAttribute('data-reduce-motion');
    return;
  }
  if (readReduceMotionFromStorage()) {
    document.documentElement.setAttribute('data-reduce-motion', 'true');
  } else {
    document.documentElement.removeAttribute('data-reduce-motion');
  }
}
