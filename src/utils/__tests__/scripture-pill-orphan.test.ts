import { describe, expect, it } from 'vitest';
import {
  isOrphanScriptureSuffix,
  isScriptureReferenceContinuationKey,
  mergeReferenceWithOrphanSuffix,
} from '../scripture-pill-orphan';

describe('isOrphanScriptureSuffix', () => {
  it('accepts verse continuation fragments', () => {
    expect(isOrphanScriptureSuffix(':2')).toBe(true);
    expect(isOrphanScriptureSuffix(' 2')).toBe(true);
    expect(isOrphanScriptureSuffix(':12-14')).toBe(true);
    expect(isOrphanScriptureSuffix('-3')).toBe(true);
  });

  it('rejects prose and empty', () => {
    expect(isOrphanScriptureSuffix('')).toBe(false);
    expect(isOrphanScriptureSuffix('and')).toBe(false);
    expect(isOrphanScriptureSuffix(' NLT')).toBe(false);
  });
});

describe('isScriptureReferenceContinuationKey', () => {
  it('accepts colon, comma, dash, and digits', () => {
    expect(isScriptureReferenceContinuationKey(':')).toBe(true);
    expect(isScriptureReferenceContinuationKey('2')).toBe(true);
    expect(isScriptureReferenceContinuationKey(',')).toBe(true);
    expect(isScriptureReferenceContinuationKey('-')).toBe(true);
  });

  it('rejects letters and multi-char keys', () => {
    expect(isScriptureReferenceContinuationKey('a')).toBe(false);
    expect(isScriptureReferenceContinuationKey('Enter')).toBe(false);
  });
});

describe('mergeReferenceWithOrphanSuffix', () => {
  it('merges chapter pill with verse suffix', () => {
    expect(mergeReferenceWithOrphanSuffix('Romans 12', ':2')).toBe('Romans 12:2');
  });

  it('returns null when suffix is not scripture continuation', () => {
    expect(mergeReferenceWithOrphanSuffix('Romans 12', ' and')).toBe(null);
  });
});
