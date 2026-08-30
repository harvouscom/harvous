/**
 * Where the release notes live on harvous.com.
 *
 * Two URLs, and the difference matters because one of them can 404.
 *
 * The site publishes a page per released version (`/release-notes/v2-87-2/`), so a deep link
 * is the nicer destination *when the version has actually been released*. It often has not:
 * the app's version bumps on every commit, and a branch build or a freshly deployed app is
 * routinely ahead of what the marketing site has published. Checked while writing this —
 * `/release-notes/v2-96-1/` was a 404 while the site's newest page was `v2-87-2`.
 *
 * So anything that must not break links to the index, which lists every release newest-first
 * and cannot go stale.
 */

const BASE = 'https://harvous.com/release-notes';

/** Every release, newest first. Always valid. */
export const RELEASE_NOTES_INDEX_URL = `${BASE}/`;

/*
 * There is deliberately no `releaseNotesUrlForVersion` here.
 *
 * One existed, mirroring harvous.com's `versionToSlug` (`2.3.10` → `/release-notes/v2-3-10/`),
 * and every caller of it was a latent 404 for the reason above. The obvious repair — try the
 * version's page and fall back to the index — is not available to us: the site is a different
 * origin, so a cross-origin `fetch` cannot report a 404 back to this app, and a `no-cors`
 * request comes back opaque. There is no way to know from here whether a version page exists.
 *
 * So the choice is between a link that is usually right and occasionally broken, and one that
 * is always right. For a link whose entire job is to take somebody somewhere, that is not a
 * close call. Deleted rather than kept with a warning, because a helper that reads as the more
 * precise option is the one people will reach for.
 */
