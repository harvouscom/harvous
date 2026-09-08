/**
 * The difference between putting away one notice and unsubscribing from all of them.
 *
 * `useDismissibleFlag` stores yes-or-no, which is correct for a message said once. This
 * variant exists because "what's new" has something different to say after every release, and
 * a boolean would have turned the first dismissal into an opt-out from every future one.
 */
import { describe, expect, it } from 'vitest';
import { releaseMarkerFor } from '@/utils/release-marker';

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
