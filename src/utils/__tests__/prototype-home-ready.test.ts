import { describe, expect, it } from 'vitest';
import {
  isPrototypeHomeContentReady,
  isPrototypeHomePresentationReady,
  isQuerySettled,
} from '../prototype-home-ready';

describe('isPrototypeHomeContentReady', () => {
  it('returns false while notes are loading', () => {
    expect(isPrototypeHomeContentReady({ notesListPhase: 'loading' })).toBe(false);
  });

  it('returns false on notes error', () => {
    expect(isPrototypeHomeContentReady({ notesListPhase: 'error' })).toBe(false);
  });

  it('returns true for list when notes are ready', () => {
    expect(isPrototypeHomeContentReady({ notesListPhase: 'list' })).toBe(true);
  });

  it('returns true for empty when notes are ready', () => {
    expect(isPrototypeHomeContentReady({ notesListPhase: 'empty' })).toBe(true);
  });
});

describe('isQuerySettled', () => {
  it('returns true when not pending', () => {
    expect(isQuerySettled(false, false)).toBe(true);
  });

  it('returns true when pending but cached data exists', () => {
    expect(isQuerySettled(true, true)).toBe(true);
  });

  it('returns false when pending with no data', () => {
    expect(isQuerySettled(true, false)).toBe(false);
  });
});

describe('isPrototypeHomePresentationReady', () => {
  const readyBase = {
    notesReady: true,
    clerkLoaded: true,
    fingerprintsSettled: true,
    tagsSettled: true,
    threadsSettled: true,
    scriptureSettled: true,
    connectionsSettled: true,
    highlightsSettled: true,
    votdSettled: true,
  };

  it('returns true when all presentation deps are settled', () => {
    expect(isPrototypeHomePresentationReady(readyBase)).toBe(true);
  });

  it('returns false while fingerprints are still loading', () => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, fingerprintsSettled: false })).toBe(false);
  });

  it('returns false while scripture index is still loading', () => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, scriptureSettled: false })).toBe(false);
  });

  it('returns false while VOTD is still loading', () => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, votdSettled: false })).toBe(false);
  });

  it('returns false while highlights are still loading', () => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, highlightsSettled: false })).toBe(false);
  });
});
