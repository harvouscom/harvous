import { describe, expect, it } from 'vitest';
import {
  OSIS_TO_CANONICAL,
  osisBookToCanonical,
  canonicalBookOrder,
  isValidVerse,
  parseOsisVerse,
  parseOsisRange,
  parseVerseId,
} from '../scripture-osis';

describe('osisBookToCanonical', () => {
  it('maps representative OSIS codes to canonical Harvous names', () => {
    expect(osisBookToCanonical('Gen')).toBe('Genesis');
    expect(osisBookToCanonical('1Cor')).toBe('1 Corinthians');
    expect(osisBookToCanonical('Ps')).toBe('Psalms');
    expect(osisBookToCanonical('Song')).toBe('Song of Solomon');
    expect(osisBookToCanonical('Rev')).toBe('Revelation');
  });

  it('returns null for unknown codes', () => {
    expect(osisBookToCanonical('Xyz')).toBeNull();
    expect(osisBookToCanonical('')).toBeNull();
  });

  it('covers all 66 books, each resolving to a real verse in the canon', () => {
    expect(Object.keys(OSIS_TO_CANONICAL)).toHaveLength(66);
    for (const canonical of Object.values(OSIS_TO_CANONICAL)) {
      // Every canonical name must exist in bible-chapters.json (1:1 is always valid).
      expect(isValidVerse(canonical, 1, 1)).toBe(true);
    }
  });
});

describe('parseOsisVerse', () => {
  it('parses a single verse', () => {
    expect(parseOsisVerse('John.3.16')).toEqual({ book: 'John', chapter: 3, verse: 16 });
    expect(parseOsisVerse('1Cor.13.4')).toEqual({ book: '1 Corinthians', chapter: 13, verse: 4 });
  });

  it('rejects malformed or unknown refs', () => {
    expect(parseOsisVerse('John.3')).toBeNull();
    expect(parseOsisVerse('Nope.1.1')).toBeNull();
    expect(parseOsisVerse('John.x.16')).toBeNull();
  });
});

describe('parseOsisRange', () => {
  it('parses a single verse as a degenerate range', () => {
    expect(parseOsisRange('Rom.5.8')).toEqual({
      book: 'Romans', chapterStart: 5, chapterEnd: 5, verseStart: 8, verseEnd: 8,
    });
  });

  it('parses a full-ref range', () => {
    expect(parseOsisRange('John.1.1-John.1.3')).toEqual({
      book: 'John', chapterStart: 1, chapterEnd: 1, verseStart: 1, verseEnd: 3,
    });
    expect(parseOsisRange('1John.4.9-1John.4.10')).toEqual({
      book: '1 John', chapterStart: 4, chapterEnd: 4, verseStart: 9, verseEnd: 10,
    });
  });

  it('parses a bare chapter.verse end inheriting the start book', () => {
    expect(parseOsisRange('John.11.25-11.26')).toEqual({
      book: 'John', chapterStart: 11, chapterEnd: 11, verseStart: 25, verseEnd: 26,
    });
  });

  it('rejects an unparseable cell', () => {
    expect(parseOsisRange('Nope.1.1-Nope.1.2')).toBeNull();
  });
});

describe('isValidVerse + canonicalBookOrder', () => {
  it('validates against canonical ranges', () => {
    expect(isValidVerse('John', 3, 16)).toBe(true);
    expect(isValidVerse('Psalms', 119, 176)).toBe(true); // last verse of the longest chapter
    expect(isValidVerse('John', 3, 99)).toBe(false);
    expect(isValidVerse('John', 99, 1)).toBe(false);
    expect(isValidVerse('Nope', 1, 1)).toBe(false);
  });

  it('orders books canonically (Genesis first, Revelation last)', () => {
    expect(canonicalBookOrder('Genesis')).toBe(1);
    expect(canonicalBookOrder('Revelation')).toBe(66);
    expect(canonicalBookOrder('Genesis')).toBeLessThan(canonicalBookOrder('John'));
    expect(canonicalBookOrder('Nope')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('parseVerseId (OpenBible bbcccvvv)', () => {
  it('decodes numeric verse ids to canonical references', () => {
    expect(parseVerseId('43003016')).toEqual({ book: 'John', chapter: 3, verse: 16 });
    expect(parseVerseId('02020001')).toEqual({ book: 'Exodus', chapter: 20, verse: 1 });
    expect(parseVerseId('48005014')).toEqual({ book: 'Galatians', chapter: 5, verse: 14 });
    expect(parseVerseId('66022021')).toEqual({ book: 'Revelation', chapter: 22, verse: 21 });
  });

  it('rejects malformed or out-of-range ids', () => {
    expect(parseVerseId('123')).toBeNull();
    expect(parseVerseId('99003016')).toBeNull(); // book 99 does not exist
    expect(parseVerseId('4300301x')).toBeNull();
  });
});
