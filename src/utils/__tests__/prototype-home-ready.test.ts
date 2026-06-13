import { describe, expect, it } from 'vitest';
import { isPrototypeHomeContentReady, isQuerySettled } from '../prototype-home-ready';

describe('isPrototypeHomeContentReady', () => {
  const settled = {
    scriptureSettled: true,
    tagsSettled: true,
    votdSettled: true,
    threadsSettled: true,
    highlightsSettled: true,
  };

  it('returns false while notes are loading', () => {
    expect(
      isPrototypeHomeContentReady({ notesListPhase: 'loading', ...settled }),
    ).toBe(false);
  });

  it('returns false on notes error', () => {
    expect(
      isPrototypeHomeContentReady({ notesListPhase: 'error', ...settled }),
    ).toBe(false);
  });

  it('returns false when any auxiliary query is not settled', () => {
    for (const flag of [
      'scriptureSettled',
      'tagsSettled',
      'votdSettled',
      'threadsSettled',
      'highlightsSettled',
    ] as const) {
      expect(
        isPrototypeHomeContentReady({ notesListPhase: 'list', ...settled, [flag]: false }),
      ).toBe(false);
    }
  });

  it('returns true for list when all sources are settled', () => {
    expect(
      isPrototypeHomeContentReady({ notesListPhase: 'list', ...settled }),
    ).toBe(true);
  });

  it('returns true for empty when all sources are settled', () => {
    expect(
      isPrototypeHomeContentReady({ notesListPhase: 'empty', ...settled }),
    ).toBe(true);
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
