/**
 * The difference between putting away one notice and unsubscribing from all of them.
 *
 * `useDismissibleFlag` stores yes-or-no, which is correct for a message said once. This
 * variant exists because "what's new" has something different to say after every release, and
 * a boolean would have turned the first dismissal into an opt-out from every future one.
 */
import { describe, expect, it } from 'vitest';
import { markerCovers, releaseMarkerFor } from '@/utils/release-marker';

describe('what counts as a new release', () => {
  it('ignores a patch bump', () => {
    /*
     * The load-bearing case. The app's version bumps on every commit, so keyed on the full
     * version this notice would return for changes nobody would call news.
     */
    expect(releaseMarkerFor('2.96.1')).toBe(releaseMarkerFor('2.96.2'));
    expect(releaseMarkerFor('2.96.1')).toBe(releaseMarkerFor('2.96.14'));
  });

  it('notices a minor bump', () => {
    expect(releaseMarkerFor('2.96.1')).not.toBe(releaseMarkerFor('2.97.0'));
  });

  it('notices a major bump', () => {
    expect(releaseMarkerFor('2.96.1')).not.toBe(releaseMarkerFor('3.0.0'));
  });

  it('has no marker without a version, so the row stays hidden', () => {
    /* A build that cannot say which release it is has no business claiming to have news, and
       an undismissable notice would be worse than no notice. */
    expect(releaseMarkerFor(undefined)).toBeNull();
    expect(releaseMarkerFor('')).toBeNull();
    expect(releaseMarkerFor('   ')).toBeNull();
  });

  it('tolerates a version with no patch part', () => {
    expect(releaseMarkerFor('2.96')).toBe('2.96');
    expect(releaseMarkerFor('3')).toBe('3');
  });
});

describe('markerCovers', () => {
  it('covers the same marker', () => {
    expect(markerCovers('3.31', '3.31')).toBe(true);
  });

  it('lets an old per-minor dismissal answer a per-major key', () => {
    expect(markerCovers('3.31', '3')).toBe(true);
    expect(markerCovers('3.0', '3')).toBe(true);
  });

  it('does not carry across majors or from a coarser key to a finer one', () => {
    expect(markerCovers('2.20', '3')).toBe(false);
    expect(markerCovers('30.1', '3')).toBe(false);
    expect(markerCovers('3', '3.31')).toBe(false);
    expect(markerCovers('3.31', '3.32')).toBe(false);
  });

  it('covers nothing when either side is missing', () => {
    expect(markerCovers(null, '3')).toBe(false);
    expect(markerCovers('3', null)).toBe(false);
  });
});
