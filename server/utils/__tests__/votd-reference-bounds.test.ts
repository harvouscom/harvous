import { describe, expect, it } from 'vitest';
import { bookFromReference, clampReferenceToMaxVerseSpan } from '../votd-reference-bounds';

/**
 * clampReferenceToMaxVerseSpan used to `return p.reference`, but
 * parseScriptureReference yields { book, chapter, verse, endChapter? } — there is no
 * `reference` field, so the two non-clamping paths returned `undefined`.
 *
 * Both callers wrote `clampReferenceToMaxVerseSpan(r, 2) ?? <fallback>`, which hid it.
 * Not harmlessly, though: votd-calendar's fallback is the *raw* input, so a reference
 * that didn't need clamping skipped normalization entirely.
 */
describe('clampReferenceToMaxVerseSpan', () => {
  it('returns a string for a single verse, not undefined', () => {
    const result = clampReferenceToMaxVerseSpan('John 3:16', 2);
    expect(result).toBeTypeOf('string');
    expect(result).toBe('John 3:16');
  });

  it('returns a string for a range already inside the limit', () => {
    const result = clampReferenceToMaxVerseSpan('John 3:16-17', 2);
    expect(result).toBeTypeOf('string');
    expect(result).toBe('John 3:16-17');
  });

  it('normalizes the reference on the pass-through paths', () => {
    // The regression that mattered: votd-calendar falls back to the raw input, so
    // returning undefined here meant lowercase/odd input was never normalized.
    expect(clampReferenceToMaxVerseSpan('john 3:16', 2)).toBe('John 3:16');
  });

  it('shortens a range that exceeds the limit', () => {
    expect(clampReferenceToMaxVerseSpan('John 3:16-20', 2)).toBe('John 3:16-17');
  });

  it('returns null — never undefined — for something unparseable', () => {
    // The declared contract is `string | null`; `undefined` would slip past `=== null`.
    expect(clampReferenceToMaxVerseSpan('not a reference', 2)).toBeNull();
  });

  it('bookFromReference still resolves a canonical book', () => {
    expect(bookFromReference('john 3:16')).toBe('John');
  });
});
