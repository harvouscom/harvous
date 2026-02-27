/**
 * SPA navigation helper used by shared components.
 * TanStack Router handles routing; this strips ?toast=&message= params
 * and fires toasts without polluting the URL, then navigates.
 */
import { router } from '../router';

export function navigate(
  href: string,
  options?: { history?: 'push' | 'replace' | 'auto' },
): Promise<void> {
  let cleanHref = href;
  try {
    const url = new URL(href, window.location.origin);
    const toastType = url.searchParams.get('toast');
    const message = url.searchParams.get('message');
    if (toastType && message) {
      url.searchParams.delete('toast');
      url.searchParams.delete('message');
      cleanHref = url.pathname + (url.search || '') + (url.hash || '');
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
  } as any);
  return Promise.resolve();
}
