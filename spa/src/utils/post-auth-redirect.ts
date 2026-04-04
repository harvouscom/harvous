/**
 * After sign-in/up, `redirect_url` is often a full absolute URL (shared/join/invite flows).
 * TanStack Router's `navigate({ to })` must receive pathname + search + hash only.
 */
export function postAuthRedirectPath(redirectParam: string | null | undefined): string {
  const home = '/';
  if (redirectParam == null || redirectParam === '') return home;
  const raw = redirectParam.trim();
  if (raw === '/') return home;

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw);
      if (typeof window !== 'undefined' && u.origin !== window.location.origin) {
        return home;
      }
      const path = `${u.pathname}${u.search}${u.hash}`;
      return path.startsWith('/') ? path : home;
    }
  } catch {
    return home;
  }

  if (raw.startsWith('/')) return raw;
  return home;
}

/** Clerk `fallbackRedirectUrl` works reliably with a same-origin absolute URL. */
export function postAuthClerkFallbackUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  const base = window.location.origin;
  if (path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
