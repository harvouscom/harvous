/**
 * Is the bundle running in this tab still the one being served?
 *
 * Old bundles keep running for longer than a deploy takes. The service worker answers `/`
 * stale-while-revalidate (public/sw.js) while `/assets/*` is immutable, so the first
 * navigation after a deploy loads the previous shell's chunks quite happily; and on the
 * prototype shell the worker deliberately never force-reloads (see
 * public/scripts/service-worker-manager.js — forcing it caused iOS PWA reload loops), it only
 * offers. Someone who dismisses that offer runs yesterday's client against today's API
 * indefinitely.
 *
 * That is a skew, and skews surface as nonsense: when the review sample payload moved from
 * `sample.cloze` to `sample.exercise.cloze`, cached bundles read `undefined.blankLengths` and
 * the Home route died with a stack pointing at code that was correct when it shipped.
 *
 * Checking a build id turns that into a question the client can answer for itself.
 */

/** Injected by vite `define` (see vite.config.ts). Empty in local builds. */
declare const __BUILD_ID__: string | undefined;

const BUILD_ID_URL = '/build-id.json';
const PROBE_TIMEOUT_MS = 2_000;

export function currentBuildId(): string | null {
  if (typeof __BUILD_ID__ === 'undefined') return null;
  return __BUILD_ID__ ? __BUILD_ID__ : null;
}

/**
 * Resolves true only when the deployed build id is known, ours is known, and they differ.
 *
 * Every uncertainty resolves false. A local build has no id, an offline tab cannot fetch one,
 * and neither is evidence of staleness — claiming it would push a reload at someone whose real
 * problem is a bug we should be fixing.
 */
export async function isStaleBuild(): Promise<boolean> {
  const mine = currentBuildId();
  if (!mine) return false;
  try {
    const res = await fetch(BUILD_ID_URL, {
      cache: 'no-store',
      credentials: 'omit',
      // Bounded because a caller is holding a crash report open waiting for this answer.
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { buildId?: unknown };
    const deployed = typeof body.buildId === 'string' ? body.buildId : '';
    if (!deployed) return false;
    return deployed !== mine;
  } catch {
    return false;
  }
}
