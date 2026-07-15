import { describe, expect, it } from 'vitest';
import { isPrototypeHomeContentReady, isQuerySettled } from '../prototype-home-ready';

describe('isPrototypeHomeContentReady', () => {
  it('returns false while notes are loading', () => {
    expect(isPrototypeHomeContentReady({ notesListPhase: 'loading' })).toBe(false);
  });

  it('returns false on notes error', () => {
    expect(isPrototypeHomeContentReady({ notesListPhase: 'error' })).toBe(false);
  });

  it('returns true for list when notes are ready (does not gate on auxiliary queries)', () => {
    expect(isPrototypeHomeContentReady({ notesListPhase: 'list' })).toBe(true);
  });

  it('returns true for empty when notes are ready (does not gate on auxiliary queries)', () => {
    expect(isPrototypeHomeContentReady({ notesListPhase: 'empty' })).toBe(true);
  });

  it('accepts only notesListPhase — auxiliary settled flags are not part of the paint contract', () => {
    // Regression lock: if someone re-adds scriptureSettled/tagsSettled/etc. to the
    // input type and AND-gates paint on them, this call site and the notes-only
    // cases above must keep failing until the AND-gate is removed again.
    const input: Parameters<typeof isPrototypeHomeContentReady>[0] = {
      notesListPhase: 'list',
    };
    expect(Object.keys(input)).toEqual(['notesListPhase']);
    expect(isPrototypeHomeContentReady(input)).toBe(true);
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
