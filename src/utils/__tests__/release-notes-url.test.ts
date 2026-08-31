import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RELEASE_NOTES_INDEX_URL,
  releaseNotesUrlForSlug,
  resetPublishedReleasesCacheForTests,
  resolveReleaseNotesUrl,
  versionToSlug,
} from '../release-notes-url';

function manifest(slugs: string[]) {
  return new Response(JSON.stringify({ slugs }), { status: 200 });
}

describe('resolveReleaseNotesUrl', () => {
  beforeEach(() => {
    resetPublishedReleasesCacheForTests();
    vi.restoreAllMocks();
  });

  it('matches the site’s own slug format', () => {
    // Mirrors `versionToSlug` in harvous.com's release-notes-data.ts. If that changes, every
    // deep link silently falls back to the index, which is the failure this test exists to catch.
    expect(versionToSlug('2.3.10')).toBe('v2-3-10');
  });

  it('links to the version’s own page once the site says it exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(manifest(['v2-113-0', 'v2-87-2']));
    // The slug is written out, so a resolver that picked the wrong one still fails here. The
    // origin is not: `VITE_HARVOUS_SITE_ORIGIN` points this at a local harvous.com while the
    // deep link is being worked on, and a hardcoded production host made the suite pass or
    // fail on whether the developer had that set. Every other case here compares against
    // `RELEASE_NOTES_INDEX_URL` for the same reason.
    await expect(resolveReleaseNotesUrl('2.113.0')).resolves.toBe(
      releaseNotesUrlForSlug('v2-113-0'),
    );
  });

  it('falls back to the index for a build the site has not published', async () => {
    // The everyday case: the app bumps its version on every commit, so it runs ahead.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(manifest(['v2-87-2']));
    await expect(resolveReleaseNotesUrl('2.113.0')).resolves.toBe(RELEASE_NOTES_INDEX_URL);
  });

  it('falls back to the index when the manifest cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(resolveReleaseNotesUrl('2.113.0')).resolves.toBe(RELEASE_NOTES_INDEX_URL);
  });

  it('falls back to the index on a malformed manifest', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ nope: true }), { status: 200 }),
    );
    await expect(resolveReleaseNotesUrl('2.113.0')).resolves.toBe(RELEASE_NOTES_INDEX_URL);
  });

  it('does not ask at all without a version', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(resolveReleaseNotesUrl(undefined)).resolves.toBe(RELEASE_NOTES_INDEX_URL);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks once however many links render', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(manifest(['v2-113-0']));
    await Promise.all([
      resolveReleaseNotesUrl('2.113.0'),
      resolveReleaseNotesUrl('2.113.0'),
      resolveReleaseNotesUrl('2.87.2'),
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
