/**
 * Book-name resolution where names collide.
 *
 * Regression origin: `parseScriptureReference('Philemon 1:6')` returned **Philippians 1:6**.
 * The resolver took the first variation that matched under a bidirectional prefix test, and
 * `phil` (a Philippians synonym) is listed before Philemon's own entry, so
 * `"philemon".startsWith("phil")` won. Typing a Philemon reference in a note produced a pill
 * showing Philippians text.
 *
 * These cases pin the disambiguation rules so a future edit to the variation list — adding a
 * synonym, reordering books — cannot quietly reintroduce it.
 */
import { describe, expect, it } from 'vitest';
import { parseScriptureReference, getBookNameVariations, normalizeText } from '../scripture-detector';
import { BIBLE_STUDY_KEYWORDS } from '../bible-study-keywords';

const bookOf = (ref: string) => parseScriptureReference(ref)?.book ?? null;

describe('book-name disambiguation', () => {
  describe('Philemon vs Philippians (the regression)', () => {
    it('resolves a full Philemon reference to Philemon', () => {
      expect(bookOf('Philemon 1:6')).toBe('Philemon');
      expect(bookOf('Philemon 1')).toBe('Philemon');
    });

    it('still resolves Philippians to Philippians', () => {
      expect(bookOf('Philippians 1:6')).toBe('Philippians');
      expect(bookOf('Philippians 4:13')).toBe('Philippians');
    });

    it('keeps each book its own abbreviation', () => {
      expect(bookOf('Phlm 1:6')).toBe('Philemon');
      // "Phil" is a declared Philippians synonym, so it is not ambiguous to us —
      // it belongs to Philippians and must stay there.
      expect(bookOf('Phil 1:6')).toBe('Philippians');
    });
  });

  describe('other near-collisions stay correct', () => {
    const cases: [string, string][] = [
      ['Jude 1:3', 'Jude'],
      ['Judges 5:1', 'Judges'],
      ['Judg 5:1', 'Judges'],
      ['John 3:16', 'John'],
      ['Job 1:1', 'Job'],
      ['Joel 2:1', 'Joel'],
      ['Jonah 1:1', 'Jonah'],
      ['Joshua 1:9', 'Joshua'],
      ['Mark 1:1', 'Mark'],
      ['Malachi 3:10', 'Malachi'],
      ['Mal 3:10', 'Malachi'],
      ['1 John 1:9', '1 John'],
      ['2 John 1:1', '2 John'],
      ['3 John 1:4', '3 John'],
      ['Titus 1:5', 'Titus'],
      ['1 Timothy 1:5', '1 Timothy'],
      ['2 Timothy 2:2', '2 Timothy'],
      ['Romans 8:28', 'Romans'],
      ['Rom 8:28', 'Romans'],
      ['Psalm 23:1', 'Psalms'],
      ['Ps 23:1', 'Psalms'],
    ];

    it.each(cases)('%s resolves to %s', (ref, expected) => {
      expect(bookOf(ref)).toBe(expected);
    });
  });

  describe('both reference shapes agree', () => {
    // The bug appeared in "Book C:V" and "Book C" alike, because both run through the
    // same resolver — assert the pair so a fix to one path cannot skip the other.
    it.each(['Philemon', 'Philippians', 'Jude', 'Judges', 'John', 'Job'])(
      '%s resolves the same with and without a verse',
      (book) => {
        expect(bookOf(`${book} 1`)).toBe(bookOf(`${book} 1:1`));
        expect(bookOf(`${book} 1`)).toBe(book === 'Psalm' ? 'Psalms' : book);
      },
    );
  });

  describe('every canonical book resolves to itself', () => {
    // The property the first-match-wins resolver violated exactly once. Stated over the
    // whole canon so a new synonym that shadows some other book fails here immediately,
    // rather than in a user's note.
    const books = BIBLE_STUDY_KEYWORDS.filter((k) => k.category === 'book').map((k) => k.name);

    it('covers the full canon', () => {
      expect(books.length).toBe(66);
    });

    it.each(books)('%s is not shadowed by another book', (name) => {
      expect(bookOf(`${name} 1:1`)).toBe(name);
    });
  });

  describe('declared abbreviations resolve to their own book', () => {
    const pairs = BIBLE_STUDY_KEYWORDS.filter((k) => k.category === 'book').flatMap((k) =>
      k.synonyms.map((s) => [s, k.name] as [string, string]),
    );

    it.each(pairs)('"%s" resolves to %s', (synonym, canonical) => {
      // A synonym that is a strict prefix of another book's synonym is genuinely
      // ambiguous; assert only that it lands on a book that claims it.
      const resolved = bookOf(`${synonym} 1:1`);
      const claimants = BIBLE_STUDY_KEYWORDS.filter(
        (k) =>
          k.category === 'book' &&
          (normalizeText(k.name) === normalizeText(synonym) ||
            k.synonyms.some((s) => normalizeText(s) === normalizeText(synonym))),
      ).map((k) => k.name);
      expect(claimants.length).toBeGreaterThan(0);
      expect(claimants).toContain(resolved);
      expect(resolved).toBe(canonical);
    });
  });

  it('rejects a book name that does not exist', () => {
    expect(parseScriptureReference('Zorp 1:1')).toBeNull();
  });

  it('exposes variations for every book', () => {
    // The resolver reads this list; an empty or partial list would make the tests above
    // pass vacuously by resolving nothing.
    expect(getBookNameVariations().length).toBeGreaterThanOrEqual(66);
  });
});
