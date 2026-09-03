import { describe, it, expect } from 'vitest';
import {
  reviewCountsByDay,
  reviewDayChipLabels,
  reviewWeekCaption,
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

describe('reviewDayChipLabels', () => {
  it('says nothing on a day with no answers', () => {
    expect(reviewDayChipLabels({ answered: 0, held: 0 })).toEqual([]);
    expect(reviewDayChipLabels(null)).toEqual([]);
  });

  it('says only the count when nothing was held', () => {
    // No "0 held" chip: the absence is honest, and naming it would be a scolding.
    expect(reviewDayChipLabels({ answered: 3, held: 0 })).toEqual(['3 reviews']);
    expect(reviewDayChipLabels({ answered: 1, held: 0 })).toEqual(['1 review']);
  });

  it('splits into two chips when some were held', () => {
    expect(reviewDayChipLabels({ answered: 3, held: 2 })).toEqual(['3 reviews', '2 held']);
  });

  it('folds into one line when every one was held', () => {
    expect(reviewDayChipLabels({ answered: 3, held: 3 })).toEqual(['3 reviews, all held']);
    expect(reviewDayChipLabels({ answered: 1, held: 1 })).toEqual(['1 review, all held']);
  });

  it('never claims more holds than answers', () => {
    expect(reviewDayChipLabels({ answered: 2, held: 5 })).toEqual(['2 reviews, all held']);
  });
});

describe('reviewWeekCaption', () => {
  it('names both figures, and drops the holds when there are none', () => {
    expect(reviewWeekCaption({ answered: 11, held: 8 })).toBe('This week: 11 reviews, 8 held.');
    expect(reviewWeekCaption({ answered: 4, held: 0 })).toBe('This week: 4 reviews.');
    expect(reviewWeekCaption({ answered: 1, held: 1 })).toBe('This week: 1 review, 1 held.');
  });

  it('says nothing at all about a week with nothing in it', () => {
    expect(reviewWeekCaption({ answered: 0, held: 0 })).toBeNull();
  });
});
