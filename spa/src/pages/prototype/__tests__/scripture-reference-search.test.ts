import { describe, expect, it } from 'vitest';
import { buildScriptureReferenceResult } from '../sidebar-universal-search';
import { elsewhereTypeFilterMatches, sidebarSearchResultIcon } from '../sidebar-search-types';

describe('buildScriptureReferenceResult', () => {
  it('offers the passage a query names even when no note cites it', () => {
    const result = buildScriptureReferenceResult('John 15');

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('scriptureReference');
    expect(result?.scriptureReference).toBe('John 15:1-27');
    expect(result?.subtitle).toBe('Read passage');
  });

  it('shows a chapter back as the chapter, not as its expanded verse span', () => {
    expect(buildScriptureReferenceResult('John 15')?.title).toBe('John 15');
    expect(buildScriptureReferenceResult('psalm 23')?.title).toBe('Psalms 23');
  });

  it('keeps the verses when the query asked for verses', () => {
    expect(buildScriptureReferenceResult('Jn 3:16')?.title).toBe('John 3:16');
    expect(buildScriptureReferenceResult('James 2:14-26')?.title).toBe('James 2:14-26');
  });

  it('resolves abbreviations, casing, and numbered books', () => {
    expect(buildScriptureReferenceResult('1 cor 13')?.scriptureReference).toBe('1 Corinthians 13:1-13');
  });

  /**
   * A chapter query normalizes to its full verse span, so the canonical reference always
   * carries a verse and cannot say whether one was asked for. Opening "Psalm 23" scrolled to
   * verse 1 is subtly wrong — the reader should land at the top of the chapter.
   */
  it('marks a focus verse only when the query named one', () => {
    expect(buildScriptureReferenceResult('John 15')?.scriptureFocusVerse).toBeUndefined();
    expect(buildScriptureReferenceResult('psalm 23')?.scriptureFocusVerse).toBeUndefined();
    expect(buildScriptureReferenceResult('Jn 3:16')?.scriptureFocusVerse).toBe(16);
    expect(buildScriptureReferenceResult('John 15:4-6')?.scriptureFocusVerse).toBe(4);
    expect(buildScriptureReferenceResult('john 15')?.scriptureReference).toBe('John 15:1-27');
    expect(buildScriptureReferenceResult('2 Tim 3:16')?.scriptureReference).toBe('2 Timothy 3:16');
  });

  it('stays away from ordinary searching', () => {
    // A half-typed book, a plain word, and a bare book name are all still just text.
    expect(buildScriptureReferenceResult('Joh')).toBeNull();
    expect(buildScriptureReferenceResult('faith')).toBeNull();
    expect(buildScriptureReferenceResult('John')).toBeNull();
    expect(buildScriptureReferenceResult('')).toBeNull();
    expect(buildScriptureReferenceResult('   ')).toBeNull();
  });

  it('refuses references that do not exist', () => {
    expect(buildScriptureReferenceResult('John 99')).toBeNull();
    expect(buildScriptureReferenceResult('John 15:99')).toBeNull();
  });

  it('is stable per passage, so the same query keeps one row', () => {
    const a = buildScriptureReferenceResult('john 15');
    const b = buildScriptureReferenceResult('Jn 15');

    expect(a?.id).toBe(b?.id);
  });

  it('carries scripture chrome and answers the scripture type filter', () => {
    expect(sidebarSearchResultIcon('scriptureReference')).toBe('book-open');
    expect(elsewhereTypeFilterMatches('scripture', 'scriptureReference')).toBe(true);
    expect(elsewhereTypeFilterMatches('all', 'scriptureReference')).toBe(true);
    expect(elsewhereTypeFilterMatches('notes', 'scriptureReference')).toBe(false);
  });
});
