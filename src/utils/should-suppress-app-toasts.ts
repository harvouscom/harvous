import { isPrototypeShellPath } from '@/lib/prototype-path';

/**
 * Auth/upgrade shells and prototype shell skip global toast UI (Sonner + offline sync chip).
 * Keep in sync with SPA toast gating in `spa/src/App.tsx` (single source: import from here).
 */
export function shouldSuppressAppToasts(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname;
  return (
    p === '/addon' ||
    p.startsWith('/sign-in') ||
    p.startsWith('/sign-up') ||
    isPrototypeShellPath(p)
  );
}
