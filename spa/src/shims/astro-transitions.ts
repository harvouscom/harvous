/**
 * Shim for astro:transitions/client in the Vite/SPA build.
 * In Astro, `navigate()` triggers a view transition. In the SPA,
 * TanStack Router handles routing — but these calls come from shared
 * components that fall back to window.location anyway, so a simple
 * location-based navigate is sufficient.
 */
export function navigate(
  href: string,
  options?: { history?: 'push' | 'replace' | 'auto' },
): Promise<void> {
  if (options?.history === 'replace') {
    window.history.replaceState(null, '', href);
  } else {
    window.history.pushState(null, '', href);
  }
  // Dispatch a popstate so any router listeners pick up the change
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  return Promise.resolve();
}
