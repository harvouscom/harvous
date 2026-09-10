/**
 * The running build's version, as published to `window` by `App.tsx`.
 *
 * Read from `window` rather than the `__APP_VERSION__` define so this stays usable from
 * anywhere, including code that runs before or outside the bundle's own define scope.
 *
 * Lives in root `src/` beside `release-marker.ts` for the same reason: both the SPA and shared
 * utils want it, and the dependency runs spa → src and never back.
 */
export function appVersion(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__;
}
