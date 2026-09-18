import { describe, expect, it } from 'vitest';
import {
  passageSpanFromMetadata,
  passageSpanFromParsed,
  passageSpansOverlap,
  selectPassageNotes,
  type PassageNoteRow,
} from '../passage-notes';

const romans8 = passageSpanFromParsed({ book: 'Romans', chapter: 8, verse: [28, 30] });

const row = (over: Partial<PassageNoteRow>): PassageNoteRow => ({
  noteId: 'n1',
  title: 'A note',
  reference: 'Romans 8:28',
  createdAt: '2026-01-01T00:00:00Z',
  book: 'Romans',
  chapter: 8,
  verse: 28,
  verseEnd: null,
  chapterEnd: null,
  ...over,
});

describe('passage overlap', () => {
  it('matches a verse inside the range and refuses one outside', () => {
    expect(passageSpansOverlap(romans8, passageSpanFromMetadata(row({ verse: 29 })))).toBe(true);
    expect(passageSpansOverlap(romans8, passageSpanFromMetadata(row({ verse: 31 })))).toBe(false);
  });

  it('matches a cited range that only partly overlaps', () => {
    expect(passageSpansOverlap(romans8, passageSpanFromMetadata(row({ verse: 26, verseEnd: 28 })))).toBe(true);
  });

  it('treats a chapter-only citation as the whole chapter', () => {
    expect(passageSpansOverlap(romans8, passageSpanFromMetadata(row({ verse: null })))).toBe(true);
  });

  it('follows a citation that crosses into the next chapter', () => {
    const span = passageSpanFromMetadata(row({ chapter: 7, verse: 24, chapterEnd: 8, verseEnd: 30 }));
    expect(passageSpansOverlap(romans8, span)).toBe(true);
    const short = passageSpanFromMetadata(row({ chapter: 7, verse: 24, chapterEnd: 8, verseEnd: 2 }));
    expect(passageSpansOverlap(romans8, short)).toBe(false);
  });

  it('never matches another book', () => {
    expect(passageSpansOverlap(romans8, passageSpanFromMetadata(row({ book: 'Genesis' })))).toBe(false);
  });
});

describe('selectPassageNotes', () => {
  it('lists each note once, newest first', () => {
    const notes = selectPassageNotes(romans8, [
      row({ noteId: 'old', createdAt: '2024-01-01T00:00:00Z' }),
      row({ noteId: 'new', createdAt: '2026-05-01T00:00:00Z', reference: 'Romans 8:28-30' }),
      row({ noteId: 'new', createdAt: '2026-05-01T00:00:00Z', verse: 30 }),
      row({ noteId: 'miss', verse: 1 }),
    ]);
    expect(notes.map((n) => n.noteId)).toEqual(['new', 'old']);
    expect(notes[0].reference).toBe('Romans 8:28-30');
  });

  it('leaves out the note you are reading from', () => {
    expect(selectPassageNotes(romans8, [row({ noteId: 'here' })], 'here')).toEqual([]);
  });
});
