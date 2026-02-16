/**
 * Shim for astro:transitions/client in the Vite/SPA build.
 * In Astro, `navigate()` triggers a view transition. In the SPA,
 * TanStack Router handles routing. We use the router instance directly
 * for proper SPA navigation without full page reloads.
 *
 * Also intercepts ?toast=&message= params so toasts fire without
 * polluting the URL bar in the SPA.
 */
import { router } from '../router';

export function navigate(
  href: string,
  options?: { history?: 'push' | 'replace' | 'auto' },
): Promise<void> {
  // Strip ?toast= and ?message= params and fire the toast instead of
  // letting them appear in the URL (toast-handler.js handles this in Astro).
  let cleanHref = href;
  try {
    const url = new URL(href, window.location.origin);
    const toastType = url.searchParams.get('toast');
    const message = url.searchParams.get('message');
    if (toastType && message) {
      url.searchParams.delete('toast');
      url.searchParams.delete('message');
      cleanHref = url.pathname + (url.search || '') + (url.hash || '');
      // Fire the toast after navigation settles
      const decoded = decodeURIComponent(message);
      setTimeout(() => {
        if (window.toast && typeof (window.toast as any)[toastType] === 'function') {
          (window.toast as any)[toastType](decoded);
        } else if (window.toast) {
          window.toast.success(decoded);
        }
      }, 50);
    }
  } catch {
    // If URL parsing fails, navigate with original href
  }

  router.navigate({
    to: cleanHref as any,
    replace: options?.history === 'replace',
  });
  return Promise.resolve();
}
