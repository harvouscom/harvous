/** Cookie name — readable on harvous.com when set with Domain=.harvous.com from the app. */
export const HV_SIGNED_IN_COOKIE = 'hv_signed_in';

function cookieBase(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host === 'harvous.com' || host.endsWith('.harvous.com')) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    return `Path=/; Domain=.harvous.com; SameSite=Lax${secure}`;
  }
  return null;
}

/** Mirror sign-in state to a parent-domain cookie so harvous.com can show Open app. */
export function syncMarketingSessionHint(signedIn: boolean): void {
  const base = cookieBase();
  if (!base) return;
  if (signedIn) {
    document.cookie = `${HV_SIGNED_IN_COOKIE}=1; ${base}; Max-Age=${60 * 60 * 24 * 30}`;
  } else {
    document.cookie = `${HV_SIGNED_IN_COOKIE}=; ${base}; Max-Age=0`;
  }
}
