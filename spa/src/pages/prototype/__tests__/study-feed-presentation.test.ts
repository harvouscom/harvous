import { describe, expect, it } from 'vitest';
import type { StudyFeedItem } from '@/utils/study-feed-items';
import { reviewDaySubjects } from '@/utils/review-activity-summary';
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

describe('the day sentence says what you came back to', () => {
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
  const subjects = (...labels: string[]) =>
    reviewDaySubjects(labels.map((label) => ({ at: '2026-08-27T10:00:00.000Z', held: true, label })));
  const day = (revisited: ReturnType<typeof subjects> | null, items: StudyFeedItem[] = [note(1)]) =>
    summarizeStudyFeedDay(items, { isToday: true, partsCount: 1, revisited });

  it('names it as a clause rather than counting it as a stat', () => {
    /*
     * It was two chips once — "25 reviews" and "10 held". A count says nothing about the study
     * it counts, and "held" was a word from the recall state that meant nothing to a reader.
     */
    const summary = day(subjects('John 15:5', 'John 15:5', 'Romans 1:7'));
    expect(summary?.stats.map((s) => s.label)).toEqual(['1 note']);
    expect(summary?.revisited?.named).toEqual(['John 15:5', 'Romans 1:7']);
    expect(JSON.stringify(summary)).not.toContain('held');
  });

  it('says nothing about it on a day with none', () => {
    expect(day(null)?.revisited).toBeNull();
    expect(day(subjects())?.revisited).toBeNull();
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
      revisited: reviewDaySubjects([{ at: '2026-08-27T10:00:00.000Z', held: true, label: 'John 15:5' }]),
    });
    /*
     * With nothing to count, the lead runs straight into the clause — "Today 1 note so far"
     * collapses to "Today  so far." otherwise, which is what shipped for a moment.
     */
    expect(summary?.stats).toEqual([]);
    expect(summary?.revisited?.named).toEqual(['John 15:5']);
    // The sheet header already says which day it is; opening with "Today" says it twice.
    expect(summary?.lead).toBe('You came back to');
  });

  it('stays silent on a day with neither', () => {
    expect(summarizeStudyFeedDay([], { isToday: true, partsCount: 0, revisited: null })).toBeNull();
    expect(summarizeStudyFeedDay([], { isToday: true, partsCount: 0 })).toBeNull();
  });
});
