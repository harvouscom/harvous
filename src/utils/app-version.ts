/**
 * The running build's version.
 *
 * Prefers the `__APP_VERSION__` build-time define, and falls back to the copy `App.tsx`
 * publishes on `window`.
 *
 * The define comes first because it is a literal baked into the bundle: it is correct from the
 * first line of the first module, and nothing can unset it. The `window` copy is assigned inside
 * a `useEffect` in `ToastSetup`, which means it does not exist during the first render pass of
 * the tree, and — because it is a plain property rather than state — a component that reads it
 * too early gets `undefined` and is never re-rendered by its arrival. Anything deciding
 * behaviour on the version was therefore one mount-order change away from silently taking the
 * wrong branch, with no error and nothing to see. `PrototypeWhatsNewPill` is the live example:
 * an undefined version makes `releaseMarkerFor` return null, the major check fails, and the row
 * quietly opens the release notes instead of the Harvous 3 sheet.
 *
 * The fallback stays, and is the reason this reads a global at all: `typeof` on an undeclared
 * identifier is safe, so this also works in Vitest and anywhere else outside a bundle that
 * performs the define.
 *
 * Lives in root `src/` beside `release-marker.ts` for the same reason: both the SPA and shared
 * utils want it, and the dependency runs spa → src and never back.
 */
declare const __APP_VERSION__: string | undefined;

export function appVersion(): string | undefined {
  if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) return __APP_VERSION__;
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__;
}
