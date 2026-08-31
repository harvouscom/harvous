/**
 * Where the release notes live on harvous.com.
 *
 * Two URLs, and the difference used to matter a great deal: the site publishes a page per
 * released version (`/release-notes/v2-87-2/`), while the app's version bumps on every commit,
 * so a build is routinely ahead of anything published. Linking straight at the version's page
 * meant a link that was usually right and occasionally a 404 — and the app could not tell which
 * from its own origin, because a cross-origin `fetch` cannot report a 404 back and a `no-cors`
 * request comes back opaque. So everything linked to the index, which is always right and never
 * specific.
 *
 * The site now publishes the missing fact: `/release-notes/published.json` lists the slugs that
 * exist, CORS-open. `resolveReleaseNotesUrl` asks it, and answers with the version's own page
 * when there is one and the index when there is not — so a deep link is only ever offered when
 * it has been confirmed to exist. Every failure path (offline, blocked, malformed, a version
 * that has not shipped) lands on the index, which is exactly where these links pointed before.
 */

const BASE = 'https://harvous.com/release-notes';

/** Every release, newest first. Always valid, and the fallback for everything below. */
export const RELEASE_NOTES_INDEX_URL = `${BASE}/`;

/** The list of slugs the site has actually published. */
export const PUBLISHED_RELEASES_URL = `${BASE}/published.json`;

/** Mirrors `versionToSlug` in harvous.com's `release-notes-data.ts`: `2.3.10` → `v2-3-10`. */
export function versionToSlug(version: string): string {
  return `v${version.replace(/\./g, '-').toLowerCase()}`;
}

export function releaseNotesUrlForSlug(slug: string): string {
  return `${BASE}/${slug}/`;
}

/**
 * One fetch per page load, shared by every caller.
 *
 * `null` once a lookup has failed, so a blocked or offline session settles on the index rather
 * than retrying the same request behind each link that renders.
 */
let publishedSlugs: Promise<Set<string> | null> | null = null;

function fetchPublishedSlugs(): Promise<Set<string> | null> {
  if (publishedSlugs) return publishedSlugs;
  publishedSlugs = fetch(PUBLISHED_RELEASES_URL)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { slugs?: unknown } | null) => {
      if (!data || !Array.isArray(data.slugs)) return null;
      return new Set(data.slugs.filter((s): s is string => typeof s === 'string'));
    })
    .catch(() => null);
  return publishedSlugs;
}

/**
 * The best URL for this version — its own page when the site has one, the index otherwise.
 *
 * Deliberately resolves to the index for a missing version rather than reporting failure: a
 * caller that has to decide what a null means is a caller that can get it wrong, and there is
 * only one right answer here.
 */
export async function resolveReleaseNotesUrl(version: string | undefined | null): Promise<string> {
  if (!version?.trim()) return RELEASE_NOTES_INDEX_URL;
  const slugs = await fetchPublishedSlugs();
  if (!slugs) return RELEASE_NOTES_INDEX_URL;
  const slug = versionToSlug(version.trim());
  return slugs.has(slug) ? releaseNotesUrlForSlug(slug) : RELEASE_NOTES_INDEX_URL;
}

/** Tests only — the cache is a module-level singleton by design. */
export function resetPublishedReleasesCacheForTests(): void {
  publishedSlugs = null;
}
