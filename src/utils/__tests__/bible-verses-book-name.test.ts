import { describe, it, expect } from 'vitest';
import { bibleVersesBookName } from '../bible-verses-book-name';
import { orderedCanonBooks } from '../bible-book-chapters';
import { parseScriptureReference } from '../scripture-detector';

describe('bibleVersesBookName', () => {
  it('resolves Song of Solomon by every spelling it is written with', () => {
    // The book the two canons used to disagree about. The detector now canonicalises all of
    // these to the stored spelling, so they arrive here already correct.
    for (const written of ['Song of Solomon', 'Song of Songs', 'Canticles', 'SOS']) {
      const parsed = parseScriptureReference(`${written} 2:1`);
      expect(bibleVersesBookName(parsed?.book ?? written)).toBe('Song of Solomon');
    }
  });

  it('leaves the canon alone while both spellings agree', () => {
    expect(bibleVersesBookName('Genesis')).toBe('Genesis');
    expect(bibleVersesBookName('1 Corinthians')).toBe('1 Corinthians');
    expect(bibleVersesBookName('Revelation')).toBe('Revelation');
  });

  it('returns an unknown name unchanged rather than inventing one', () => {
    expect(bibleVersesBookName('Hezekiah')).toBe('Hezekiah');
  });

  it('round-trips every book in the canon', () => {
    // The property that matters: parsing a stored book name and mapping it back must land on
    // the same string, or a chapter fetched by one name cannot be stored under the other.
    for (const stored of orderedCanonBooks()) {
      const parsed = parseScriptureReference(`${stored} 1`);
      expect(bibleVersesBookName(parsed?.book ?? stored)).toBe(stored);
    }
  });
});
