import { describe, expect, it } from 'vitest';
import {
  buildReaderChapterStudy,
  canonicalizeReaderBook,
  chapterReferenceLikePattern,
  versesCoveredInChapter,
  type ReaderHighlightRow,
  type ReaderPassageRow,
} from '../reader-chapter';

const passage = (over: Partial<ReaderPassageRow> = {}): ReaderPassageRow => ({
  noteId: 'note_1',
  noteTitle: 'Grace',
  reference: 'John 3:16',
  chapter: 3,
  verse: 16,
  verseEnd: null,
  chapterEnd: null,
  ...over,
});

const highlight = (over: Partial<ReaderHighlightRow> = {}): ReaderHighlightRow => ({
  id: 'study_1',
  parentNoteId: 'note_1',
  parentNoteTitle: 'Grace',
  scriptureReference: 'John 3:16',
  highlightAccentRaw: 'warmAmber',
  entryKindRaw: 'scriptureLink',
  scripturePassageExcerpt: 'For God so loved the world',
  ...over,
});

describe('versesCoveredInChapter', () => {
  it('covers only the start verse when a row names one verse', () => {
    expect(versesCoveredInChapter({ chapter: 3, verse: 16, verseEnd: null, chapterEnd: null }, 3, 36)).toEqual([16]);
  });

  it('covers the whole range for a same-chapter span', () => {
    expect(versesCoveredInChapter({ chapter: 3, verse: 16, verseEnd: 18, chapterEnd: null }, 3, 36)).toEqual([
      16, 17, 18,
    ]);
  });

  it('returns nothing for a chapter the row does not touch', () => {
    expect(versesCoveredInChapter({ chapter: 3, verse: 16, verseEnd: null, chapterEnd: null }, 4, 54)).toEqual([]);
    expect(versesCoveredInChapter({ chapter: 3, verse: 16, verseEnd: null, chapterEnd: null }, 2, 25)).toEqual([]);
  });

  it('runs to the end of the opening chapter of a cross-chapter span', () => {
    // Exodus 6:28-7:7 read at chapter 6 covers 28 to the chapter end.
    expect(versesCoveredInChapter({ chapter: 6, verse: 28, verseEnd: 7, chapterEnd: 7 }, 6, 30)).toEqual([28, 29, 30]);
  });

  it('starts at verse 1 in the closing chapter of a cross-chapter span', () => {
    expect(versesCoveredInChapter({ chapter: 6, verse: 28, verseEnd: 7, chapterEnd: 7 }, 7, 25)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('covers a whole middle chapter of a multi-chapter span', () => {
    const covered = versesCoveredInChapter({ chapter: 5, verse: 1, verseEnd: 29, chapterEnd: 7 }, 6, 34);
    expect(covered[0]).toBe(1);
    expect(covered[covered.length - 1]).toBe(34);
    expect(covered).toHaveLength(34);
  });

  it('treats a chapter-only row (no verse) as the whole chapter it names', () => {
    // A row that recorded only a chapter has verse null; it should not silently vanish.
    expect(versesCoveredInChapter({ chapter: 3, verse: null, verseEnd: 36, chapterEnd: null }, 3, 36)).toHaveLength(36);
  });

  it('clamps a range that overshoots the chapter length', () => {
    expect(versesCoveredInChapter({ chapter: 3, verse: 34, verseEnd: 99, chapterEnd: null }, 3, 36)).toEqual([
      34, 35, 36,
    ]);
  });
});

describe('buildReaderChapterStudy', () => {
  it('places a note on every verse its reference covers', () => {
    const study = buildReaderChapterStudy({
      book: 'John',
      chapter: 3,
      maxVerse: 36,
      passages: [passage({ reference: 'John 3:16-18', verse: 16, verseEnd: 18 })],
      highlights: [],
    });

    expect(Object.keys(study).sort()).toEqual(['16', '17', '18']);
    expect(study[17].notes).toEqual([{ noteId: 'note_1', title: 'Grace', reference: 'John 3:16-18' }]);
  });

  it('shows a note once per verse even when several rows cite it', () => {
    const study = buildReaderChapterStudy({
      book: 'John',
      chapter: 3,
      maxVerse: 36,
      passages: [
        passage({ reference: 'John 3:16' }),
        passage({ reference: 'John 3:16-17', verseEnd: 17 }),
      ],
      highlights: [],
    });

    expect(study[16].notes).toHaveLength(1);
    expect(study[17].notes).toHaveLength(1);
  });

  it('expands a highlight range onto each verse it touches', () => {
    const study = buildReaderChapterStudy({
      book: 'John',
      chapter: 3,
      maxVerse: 36,
      passages: [],
      highlights: [highlight({ scriptureReference: 'John 3:16-18' })],
    });

    expect(Object.keys(study).sort()).toEqual(['16', '17', '18']);
    expect(study[16].highlights[0]).toMatchObject({
      id: 'study_1',
      parentNoteId: 'note_1',
      accent: 'warmAmber',
      reference: 'John 3:16-18',
    });
  });

  it('keeps a highlight out of verses in another chapter', () => {
    const study = buildReaderChapterStudy({
      book: 'John',
      chapter: 4,
      maxVerse: 54,
      passages: [],
      highlights: [highlight({ scriptureReference: 'John 3:16' })],
    });

    expect(study).toEqual({});
  });

  it('ignores a highlight with no reference or an unparseable one', () => {
    const study = buildReaderChapterStudy({
      book: 'John',
      chapter: 3,
      maxVerse: 36,
      passages: [],
      highlights: [
        highlight({ id: 'a', scriptureReference: null }),
        highlight({ id: 'b', scriptureReference: '   ' }),
        highlight({ id: 'c', scriptureReference: 'not a reference at all' }),
      ],
    });

    expect(study).toEqual({});
  });

  it('carries notes and highlights on the same verse together', () => {
    const study = buildReaderChapterStudy({
      book: 'John',
      chapter: 3,
      maxVerse: 36,
      passages: [passage()],
      highlights: [highlight()],
    });

    expect(study[16].notes).toHaveLength(1);
    expect(study[16].highlights).toHaveLength(1);
  });
});

describe('chapterReferenceLikePattern', () => {
  it('matches the chapter prefix references are normalized to', () => {
    expect(chapterReferenceLikePattern('John', 3)).toBe('John 3:%');
  });

  it('escapes LIKE wildcards so a book name stays literal', () => {
    // `_` is a single-character wildcard in LIKE; a book name must not act as a pattern.
    expect(chapterReferenceLikePattern('Song_of Solomon', 2)).toBe('Song\\_of Solomon 2:%');
  });
});

describe('canonicalizeReaderBook', () => {
  it('accepts the canonical spelling', () => {
    expect(canonicalizeReaderBook('John')).toBe('John');
    expect(canonicalizeReaderBook('1 John')).toBe('1 John');
    expect(canonicalizeReaderBook('Song of Solomon')).toBe('Song of Solomon');
  });

  it('accepts loose casing and missing spaces', () => {
    expect(canonicalizeReaderBook('PSALMS')).toBe('Psalms');
    expect(canonicalizeReaderBook('1john')).toBe('1 John');
    expect(canonicalizeReaderBook('  revelation ')).toBe('Revelation');
  });

  it('rejects an unknown book rather than guessing', () => {
    expect(canonicalizeReaderBook('Enoch')).toBeNull();
    expect(canonicalizeReaderBook('')).toBeNull();
  });
});
