/** sessionStorage flag: user opened Support from a route error screen — pre-select Bug topic. */
export const SUPPORT_FROM_ERROR_SESSION_KEY = 'harvous_support_from_error';

export function markSupportOpenedFromError(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SUPPORT_FROM_ERROR_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function consumeSupportOpenedFromError(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const had = sessionStorage.getItem(SUPPORT_FROM_ERROR_SESSION_KEY) === '1';
    if (had) sessionStorage.removeItem(SUPPORT_FROM_ERROR_SESSION_KEY);
    return had;
  } catch {
    return false;
  }
}
