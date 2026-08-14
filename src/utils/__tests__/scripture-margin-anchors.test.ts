import { describe, expect, it } from 'vitest';
import {
  buildChapterMarginAnchors,
  resolveCanonicalBookOrder,
  type MarginAnchorBookLike,
  type MarginAnchorNoteLike,
} from '@/utils/scripture-margin-anchors';

const JOHN = resolveCanonicalBookOrder('John')!;
const EXODUS = resolveCanonicalBookOrder('Exodus')!;

function note(id: string, updatedAt: string | null = '2026-01-01T00:00:00.000Z'): MarginAnchorNoteLike {
  return { id, title: `Note ${id}`, updatedAt, createdAt: '2025-01-01T00:00:00.000Z' };
}

function passage(
  bookOrder: number,
  chapter: number,
  verseStart: number,
  verseEnd: number,
  notes: MarginAnchorNoteLike[],
) {
  return {
    passageKey: `${bookOrder}:${chapter}:${verseStart}:${verseEnd}`,
    displayRef: `ref ${chapter}:${verseStart}-${verseEnd}`,
    bookOrder,
    chapter,
    verseStart,
    verseEnd,
    notes,
  };
}

function books(...passages: ReturnType<typeof passage>[]): MarginAnchorBookLike[] {
  const byBook = new Map<number, MarginAnchorBookLike>();
  for (const p of passages) {
    let entry = byBook.get(p.bookOrder);
    if (!entry) {
      entry = { bookOrder: p.bookOrder, passages: [] };
      byBook.set(p.bookOrder, entry);
    }
    entry.passages.push(p);
  }
  return [...byBook.values()];
}

describe('buildChapterMarginAnchors', () => {
  it('anchors a single-verse citation to that verse only', () => {
    const result = buildChapterMarginAnchors(books(passage(JOHN, 15, 5, 5, [note('a')])), 'John', 15);

    expect([...result.byVerse.keys()]).toEqual([5]);
    expect(result.byVerse.get(5)?.map((n) => n.id)).toEqual(['a']);
    expect(result.wholeChapter).toEqual([]);
  });

  it('marks every verse a range covers, so the dot is beside the verse being read', () => {
    const result = buildChapterMarginAnchors(books(passage(JOHN, 15, 1, 8, [note('a')])), 'John', 15);

    expect([...result.byVerse.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.byVerse.get(5)?.map((n) => n.id)).toEqual(['a']);
  });

  it('lifts a whole-chapter citation out of the gutter instead of striping every verse', () => {
    // "John 15" normalizes to John 15:1-27 before it reaches the index.
    const result = buildChapterMarginAnchors(books(passage(JOHN, 15, 1, 27, [note('a')])), 'John', 15);

    expect(result.byVerse.size).toBe(0);
    expect(result.wholeChapter.map((n) => n.id)).toEqual(['a']);
  });

  it('anchors a flattened cross-chapter range from its start to the end of its own chapter', () => {
    // "Exodus 6:28-7:7" reaches the index as chapter 6, verses [28, 7] — inverted.
    const result = buildChapterMarginAnchors(books(passage(EXODUS, 6, 28, 7, [note('a')])), 'Exodus', 6);

    expect([...result.byVerse.keys()]).toEqual([28, 29, 30]);
    expect(result.wholeChapter).toEqual([]);
  });

  it('counts a note once per verse when overlapping passages cite it twice', () => {
    const result = buildChapterMarginAnchors(
      books(passage(JOHN, 15, 1, 8, [note('a')]), passage(JOHN, 15, 5, 5, [note('a')])),
      'John',
      15,
    );

    expect(result.byVerse.get(5)?.map((n) => n.id)).toEqual(['a']);
  });

  it('collects distinct notes on the same verse, most recently touched first', () => {
    const older = note('older', '2026-01-01T00:00:00.000Z');
    const newer = note('newer', '2026-06-01T00:00:00.000Z');
    const result = buildChapterMarginAnchors(
      books(passage(JOHN, 15, 5, 5, [older]), passage(JOHN, 15, 4, 6, [newer])),
      'John',
      15,
    );

    expect(result.byVerse.get(5)?.map((n) => n.id)).toEqual(['newer', 'older']);
  });

  it('falls back to createdAt when a note has never been updated', () => {
    const never: MarginAnchorNoteLike = {
      id: 'never',
      title: null,
      updatedAt: null,
      createdAt: '2027-01-01T00:00:00.000Z',
    };
    const result = buildChapterMarginAnchors(
      books(passage(JOHN, 15, 5, 5, [note('touched', '2026-01-01T00:00:00.000Z'), never])),
      'John',
      15,
    );

    expect(result.byVerse.get(5)?.map((n) => n.id)).toEqual(['never', 'touched']);
  });

  it('ignores other books, other chapters, and passages carrying no notes', () => {
    const result = buildChapterMarginAnchors(
      books(
        passage(JOHN, 14, 5, 5, [note('other-chapter')]),
        passage(EXODUS, 15, 5, 5, [note('other-book')]),
        passage(JOHN, 15, 9, 9, []),
      ),
      'John',
      15,
    );

    expect(result.byVerse.size).toBe(0);
    expect(result.wholeChapter).toEqual([]);
  });

  it('returns nothing for a book name that is not canonical', () => {
    const result = buildChapterMarginAnchors(books(passage(JOHN, 15, 5, 5, [note('a')])), 'Hezekiah', 15);

    expect(result.byVerse.size).toBe(0);
    expect(result.wholeChapter).toEqual([]);
  });
});

describe('resolveCanonicalBookOrder', () => {
  it('matches the zero-based order the scripture index is built with', () => {
    expect(resolveCanonicalBookOrder('Genesis')).toBe(0);
    expect(resolveCanonicalBookOrder('John')).toBe(42);
  });

  it('accepts the Song of Songs alias and rejects unknown names', () => {
    expect(resolveCanonicalBookOrder('Song of Songs')).toBe(resolveCanonicalBookOrder('Song of Solomon'));
    expect(resolveCanonicalBookOrder('Hezekiah')).toBeNull();
  });
});
