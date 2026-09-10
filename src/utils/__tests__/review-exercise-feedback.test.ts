import { describe, expect, it } from 'vitest';
import {
  REVIEW_DISLIKE_THRESHOLD,
  REVIEW_DISLIKE_WINDOW_DAYS,
  describeDislike,
  quietedFamilies,
  quietedKeySet,
  reviewDislikeWindowStart,
  type ReviewDislikeRow,
} from '@/utils/review-exercise-feedback';
import { ALWAYS_ON_FAMILIES } from '@/utils/review-exercise-settings';
import { reviewPromptKeysInFamily } from '@/utils/review-exercise-families';

/** `verse.rebuild` is in the `blanks` family, which the reader can switch off in Settings. */
const BLANKS = 'verse.rebuild';
/** `note.recognize` is in `note`, which is always-on and therefore has no switch to offer. */
const ALWAYS_ON = 'note.recognize';

const rows = (rungKey: string, itemIds: string[]): ReviewDislikeRow[] =>
  itemIds.map((reviewItemId) => ({ reviewItemId, rungKey }));

describe('quieting a family takes three separate items', () => {
  it('does not quiet a family thumbed down three times on one item', () => {
    // One passage asked badly is a complaint about the passage, not about the kind of question.
    expect(quietedFamilies(rows(BLANKS, ['a', 'a', 'a'])).size).toBe(0);
  });

  it('quiets a family once three distinct items have been thumbed down', () => {
    expect([...quietedFamilies(rows(BLANKS, ['a', 'b', 'c']))]).toEqual(['blanks']);
  });

  it('holds off at one item short of the threshold', () => {
    const short = rows(BLANKS, ['a', 'b']);
    expect(short).toHaveLength(REVIEW_DISLIKE_THRESHOLD - 1);
    expect(quietedFamilies(short).size).toBe(0);
  });

  it('ignores rows whose rung was never recorded', () => {
    const nulls: ReviewDislikeRow[] = ['a', 'b', 'c'].map((reviewItemId) => ({
      reviewItemId,
      rungKey: null,
    }));
    expect(quietedFamilies(nulls).size).toBe(0);
  });

  it('counts each family separately rather than pooling dislikes', () => {
    const mixed = [...rows(BLANKS, ['a', 'b']), ...rows('verse.locate', ['c'])];
    expect(quietedFamilies(mixed).size).toBe(0);
  });
});

describe('an always-on family', () => {
  it('is still quieted, so the walk can prefer another member where one exists', () => {
    // Quieting is a reason to walk past, and a note carrying citations can be asked `cited`
    // instead. What it is never allowed to be is a reason to return nothing.
    expect([...quietedFamilies(rows(ALWAYS_ON, ['a', 'b', 'c']))]).toEqual(['note']);
  });

  it('is never offered as a setting, because there is no switch to offer', () => {
    const { family, offerSettings } = describeDislike(ALWAYS_ON, rows(ALWAYS_ON, ['a', 'b', 'c']));
    expect(ALWAYS_ON_FAMILIES).toContain(family);
    expect(offerSettings).toBe(false);
  });
});

describe('the settings offer', () => {
  it('is made on the vote that reaches the threshold', () => {
    expect(describeDislike(BLANKS, rows(BLANKS, ['a', 'b', 'c'])).offerSettings).toBe(true);
  });

  it('is not repeated on the fourth', () => {
    // An offer repeated is a nag, and the reader has already been shown where the switch is.
    expect(describeDislike(BLANKS, rows(BLANKS, ['a', 'b', 'c', 'd'])).offerSettings).toBe(false);
  });

  it('is not made before the threshold', () => {
    expect(describeDislike(BLANKS, rows(BLANKS, ['a', 'b'])).offerSettings).toBe(false);
  });
});

describe('a vote on an item that was never asked', () => {
  /*
   * Found by testing the live endpoint. An item with no `lastRungKey` writes a row with a null
   * rung, and the tally skips those — but the family lookup falls back to `opening`, so the
   * response used to name a family the vote had not been filed under.
   */
  it('names no family, because it was counted toward none', () => {
    expect(describeDislike(null, rows(BLANKS, ['a', 'b']))).toEqual({
      family: null,
      offerSettings: false,
    });
  });

  it('cannot reach the threshold, however many are cast', () => {
    const nulls: ReviewDislikeRow[] = ['a', 'b', 'c', 'd'].map((reviewItemId) => ({
      reviewItemId,
      rungKey: null,
    }));
    expect(describeDislike(null, nulls).offerSettings).toBe(false);
    expect(quietedFamilies(nulls).size).toBe(0);
  });
});

describe('the key set handed to the rung walk', () => {
  it('covers every rung in a quieted family, not just the one thumbed down', () => {
    const keys = quietedKeySet(rows(BLANKS, ['a', 'b', 'c']));
    for (const key of reviewPromptKeysInFamily('blanks')) expect(keys.has(key)).toBe(true);
  });

  it('is empty when nothing has reached the threshold', () => {
    expect(quietedKeySet(rows(BLANKS, ['a'])).size).toBe(0);
  });
});

describe('the window', () => {
  it('opens exactly REVIEW_DISLIKE_WINDOW_DAYS before now', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const start = reviewDislikeWindowStart(now);
    const days = (now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(REVIEW_DISLIKE_WINDOW_DAYS);
  });
});
