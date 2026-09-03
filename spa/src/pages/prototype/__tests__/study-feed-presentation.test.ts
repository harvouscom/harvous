import { describe, expect, it } from 'vitest';
import type { StudyFeedItem } from '@/utils/study-feed-items';
import {
  formatChapterRange,
  studyFeedItemIcon,
  studyFeedRowCopy,
  summarizeStudyFeedDay,
} from '../study-feed-presentation';

const revisit = (
  title: string,
  noteType?: string | null,
  folder?: string | null,
): StudyFeedItem => ({
  id: `revisit-${title}`,
  kind: 'note-revisited',
  at: '2026-08-27T15:09:00.000Z',
  noteId: `note-${title}`,
  title,
  noteType: noteType ?? null,
  folder: folder ?? null,
  visitCount: 1,
});

const reading: StudyFeedItem = {
  id: 'reading',
  kind: 'passage-read',
  at: '2026-08-27T14:43:00.000Z',
  book: 'John',
  bookOrder: 42,
  chapters: [3],
  translation: 'NLT',
  dwellBucket: 'study',
};

describe('studyFeedRowCopy', () => {
  it('leads with the subject and demotes the verb', () => {
    // Not "You returned to Adoption" — a column of those reads as one repeated action.
    expect(studyFeedRowCopy(revisit('Adoption'))).toMatchObject({
      title: 'Adoption',
      verb: 'Returned to',
    });
    expect(studyFeedRowCopy(reading)).toMatchObject({ title: 'John 3', verb: 'Studied' });
  });

  it('names the folder a note lives in, as part of the phrase', () => {
    // Not a separate `detail`: the row joins meta with a middot, and "Returned to ·
    // Romans" cuts a verb from its object. Peers take a middot; a clause does not.
    expect(studyFeedRowCopy(revisit('Adoption', null, 'Romans'))).toMatchObject({
      verb: 'Returned to Romans',
      detail: undefined,
    });
  });

  it('quotes a highlight, since the title is words rather than a name', () => {
    const copy = studyFeedRowCopy({
      id: 'h',
      kind: 'highlight-scripture',
      at: '2026-08-27T14:00:00.000Z',
      entryId: 'e',
      accent: 'warmAmber',
      excerpt: 'hate the light',
      reference: 'John 3:20',
    });
    expect(copy).toMatchObject({ title: 'hate the light', quoted: true, detail: 'John 3:20' });
  });
});

describe('studyFeedItemIcon', () => {
  it('wears the glyph of the thing it opens', () => {
    expect(studyFeedItemIcon(revisit('Adoption'))).toBe('note-sticky');
    expect(studyFeedItemIcon(revisit('Romans 8', 'scripture'))).toBe('scroll');
    expect(studyFeedItemIcon(reading)).toBe('book-open');
  });
});

describe('formatChapterRange', () => {
  it('reads a run as a range and a gap as a list', () => {
    expect(formatChapterRange('John', [15, 16, 17])).toBe('John 15–17');
    expect(formatChapterRange('John', [15])).toBe('John 15');
    expect(formatChapterRange('John', [15, 17])).toBe('John 15, 17');
  });
});

describe('the day sentence counts reviews', () => {
  const note = (n: number): StudyFeedItem => ({
    id: `note-${n}`,
    kind: 'note-created',
    at: '2026-08-27T09:00:00.000Z',
    noteId: `note-${n}`,
    title: `Note ${n}`,
    noteType: null,
    folder: null,
    snippet: '',
    scriptureRefs: [],
  });
  const day = (reviews: { answered: number; held: number } | null, items: StudyFeedItem[] = [note(1)]) =>
    summarizeStudyFeedDay(items, { isToday: true, partsCount: 1, reviews });

  const labels = (reviews: { answered: number; held: number } | null, items?: StudyFeedItem[]) =>
    day(reviews, items)?.stats.map((s) => s.label) ?? [];

  it('adds the chip after what was written and read', () => {
    expect(labels({ answered: 3, held: 0 })).toEqual(['1 note', '3 reviews']);
  });

  it('adds a second chip for what was held, and folds a perfect day into one', () => {
    expect(labels({ answered: 3, held: 2 })).toEqual(['1 note', '3 reviews', '2 held']);
    expect(labels({ answered: 3, held: 3 })).toEqual(['1 note', '3 reviews, all held']);
  });

  it('says nothing about reviews on a day with none, exactly as before', () => {
    expect(labels(null)).toEqual(['1 note']);
    expect(labels({ answered: 0, held: 0 })).toEqual(['1 note']);
  });

  it('keeps the cap of three, and outranks notes revisited', () => {
    /*
     * Answering a question about something is a stronger account of the day than opening it
     * again, so "revisited" is the chip that gets pushed out — never the review count.
     */
    const items = [note(1), note(2), revisit('A note'), revisit('Another')];
    const out = labels({ answered: 2, held: 1 }, items);
    expect(out).toHaveLength(3);
    expect(out).toContain('2 reviews');
    expect(out.some((l) => l.includes('revisited'))).toBe(false);
  });

  it('speaks for a day whose only record is the reviews', () => {
    // See "a day of reviews and nothing else" below: this is the shape the chip exists for.
    expect(
      summarizeStudyFeedDay([], { isToday: true, partsCount: 0, reviews: { answered: 4, held: 4 } })
        ?.stats.map((s) => s.label),
    ).toEqual(['4 reviews, all held']);
  });
});

describe('a day of reviews and nothing else', () => {
  it('still says what happened', () => {
    /*
     * The shape a busy week actually produces: nothing written, nothing read, three questions
     * answered on the way past. Bailing on an empty item list hid the chip on exactly the days
     * it was added for.
     */
    const summary = summarizeStudyFeedDay([], {
      isToday: true,
      partsCount: 0,
      reviews: { answered: 3, held: 3 },
    });
    expect(summary?.stats.map((s) => s.label)).toEqual(['3 reviews, all held']);
    expect(summary?.lead).toBe('Today');
  });

  it('stays silent on a day with neither', () => {
    expect(summarizeStudyFeedDay([], { isToday: true, partsCount: 0, reviews: null })).toBeNull();
    expect(summarizeStudyFeedDay([], { isToday: true, partsCount: 0 })).toBeNull();
  });
});
