/**
 * Which release a version belongs to, for anything that should react to a new one.
 *
 * The app's version bumps on every commit, so `2.96.1` becomes `2.96.2` constantly. Anything
 * keyed on the full version therefore fires for changes nobody would call a release —
 * a "what's new" notice returning after a typo fix, a summary invalidating itself hourly.
 * The minor is the granularity at which something actually turned over.
 *
 * Lives in root `src/` rather than beside its first caller in `spa/` because both the SPA and
 * shared utils need it, and the dependency runs spa → src and never back.
 */
export function releaseMarkerFor(version: string | undefined | null): string | null {
  const raw = (version ?? '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length < 2) return raw;
  return `${parts[0]}.${parts[1]}`;
}
