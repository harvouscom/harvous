import { describe, it, expect } from 'vitest';
import {
  reviewCountsByDay,
  reviewDayRevisitedCopy,
  reviewDaySubjects,
  reviewWeekCounts,
} from '@/utils/review-activity-summary';

/** Local times, because the bucketing is local — a UTC fixture would pass in one zone only. */
const at = (day: number, hour = 9) => new Date(2026, 8, day, hour).toISOString();
const NOW = new Date(2026, 8, 3, 12);

describe('reviewCountsByDay', () => {
  it('counts answers and holds per local day', () => {
    const byDay = reviewCountsByDay([
      { at: at(3, 8), held: true },
      { at: at(3, 20), held: false },
      { at: at(2), held: true },
    ]);
    expect(byDay.get('2026-09-03')).toEqual({ answered: 2, held: 1 });
    expect(byDay.get('2026-09-02')).toEqual({ answered: 1, held: 1 });
    expect(byDay.get('2026-09-01')).toBeUndefined();
  });

  it('ignores a timestamp it cannot read rather than inventing a day', () => {
    expect(reviewCountsByDay([{ at: 'not a date', held: true }]).size).toBe(0);
  });
});

describe('reviewWeekCounts', () => {
  it('takes the last seven days including today', () => {
    // Today is 3 September, so the window runs 28 August through today, inclusive.
    const answers = [
      { at: at(3), held: true },
      { at: at(1), held: false },
      { at: new Date(2026, 7, 28, 9).toISOString(), held: true },
      { at: new Date(2026, 7, 27, 23, 59).toISOString(), held: true },
    ];
    expect(reviewWeekCounts(answers, NOW)).toEqual({ answered: 3, held: 2 });
  });

  it('counts an answer from the first moment of the seventh day back', () => {
    // The window starts at midnight, not at this hour seven days ago.
    const edge = new Date(2026, 7, 28, 0, 1).toISOString();
    expect(reviewWeekCounts([{ at: edge, held: false }], NOW)).toEqual({ answered: 1, held: 0 });
  });
});

describe('what the day says you came back to', () => {
  const answer = (label: string | null, day = 3) => ({ at: at(day), held: true, label });

  it('names the subject answered most that day', () => {
    const subjects = reviewDaySubjects([
      answer('Romans 1:7'),
      answer('John 15:5'),
      answer('John 15:5'),
    ]);
    expect(subjects.named[0]).toBe('John 15:5');
  });

  it('names two and then says what the rest are', () => {
    /*
     * "and four others" was the first attempt and says nothing — a reader cannot tell whether
     * they spent the day in the Psalms or in their own notes.
     */
    const copy = reviewDayRevisitedCopy(
      reviewDaySubjects([
        answer('John 15:5'),
        answer('Romans 1:7'),
        answer('Psalm 23:1'),
        answer('Genesis 1:1'),
      ]),
    );
    expect(copy?.named).toEqual(['John 15:5', 'Romans 1:7']);
    expect(copy?.tail).toBe(', and 2 more passages');
  });

  it('knows a note from a passage', () => {
    const notes = reviewDayRevisitedCopy(
      reviewDaySubjects([answer('John 15:5'), answer('Romans 1:7'), answer('My journey'), answer('The first book')]),
    );
    expect(notes?.tail).toBe(', and 2 more notes');
    const mixed = reviewDayRevisitedCopy(
      reviewDaySubjects([answer('John 15:5'), answer('Romans 1:7'), answer('My journey'), answer('Psalm 23:1')]),
    );
    expect(mixed?.tail).toBe(', and 2 more things');
  });

  it('says one more in the singular', () => {
    const copy = reviewDayRevisitedCopy(
      reviewDaySubjects([answer('John 15:5'), answer('Romans 1:7'), answer('Psalm 23:1')]),
    );
    expect(copy?.tail).toBe(', and one more passage');
  });

  it('says nothing at all when nothing carried a name', () => {
    expect(reviewDayRevisitedCopy(reviewDaySubjects([answer(null), answer(null)]))).toBeNull();
    expect(reviewDayRevisitedCopy(reviewDaySubjects([]))).toBeNull();
  });
});
