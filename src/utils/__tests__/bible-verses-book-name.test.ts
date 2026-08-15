import { describe, it, expect } from 'vitest';
import { bibleVersesBookName } from '../bible-verses-book-name';
import { orderedCanonBooks } from '../bible-book-chapters';
import { parseScriptureReference } from '../scripture-detector';

describe('bibleVersesBookName', () => {
  it('maps the detector name onto the stored spelling', () => {
    // The one book where the two canons disagree. Before this, `WHERE book = 'Song of Songs'`
    // matched nothing and the book was unreachable in the reader.
    expect(bibleVersesBookName('Song of Songs')).toBe('Song of Solomon');
  });

  it('leaves the sixty-five that already agree alone', () => {
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
