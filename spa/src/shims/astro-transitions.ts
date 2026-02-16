/**
 * Shim for astro:transitions/client in the Vite/SPA build.
 * In Astro, `navigate()` triggers a view transition. In the SPA,
 * TanStack Router handles routing. We use the router instance directly
 * for proper SPA navigation without full page reloads.
 */
import { router } from '../router';

export function navigate(
  href: string,
  options?: { history?: 'push' | 'replace' | 'auto' },
): Promise<void> {
  router.navigate({
    to: href as any,
    replace: options?.history === 'replace',
  });
  return Promise.resolve();
}
