import { describe, expect, it } from 'vitest';
import {
  SITTING_STALE_MS,
  resolveReviewDockItem,
  reviewQuestionKey,
  shouldReaskInSitting,
  shouldReleaseHeldItem,
  sittingIsStale,
  sittingProgress,
} from '../review-dock-state';

const item = (id: string) => ({ id });

describe('resolveReviewDockItem', () => {
  it('prefers the item that was asked for', () => {
    expect(resolveReviewDockItem('b', [item('a'), item('b')])).toEqual(item('b'));
  });

  it('finds a requested item that is scheduled rather than due', () => {
    // A "Coming back later" row on the Review page names an item the session does not hold.
    expect(resolveReviewDockItem('z', [item('a')], [item('z')])).toEqual(item('z'));
  });

  it('advances to the head of the queue when the requested item is gone', () => {
    // What happens the render after an answer: the mutation drops it from the session.
    expect(resolveReviewDockItem('answered', [item('next')])).toEqual(item('next'));
  });

  it('takes the head of the queue when nothing was asked for', () => {
    expect(resolveReviewDockItem(null, [item('a'), item('b')])).toEqual(item('a'));
    expect(resolveReviewDockItem(undefined, [item('a')])).toEqual(item('a'));
  });

  it('waits for the full list rather than guessing at the head of the queue', () => {
    // A scheduled item was tapped; the list that holds it has not come back yet.
    expect(resolveReviewDockItem('z', [item('a')], [], { fallbackPending: true })).toBeNull();
    // Once it has, the item that was asked for, not the head.
    expect(resolveReviewDockItem('z', [item('a')], [item('z')], { fallbackPending: false })).toEqual(item('z'));
    // A due item never waits on the other list.
    expect(resolveReviewDockItem('a', [item('a')], [], { fallbackPending: true })).toEqual(item('a'));
  });

  it('answers null rather than guessing when there is nothing due', () => {
    expect(resolveReviewDockItem('x', [], [])).toBeNull();
    expect(resolveReviewDockItem(null, [])).toBeNull();
  });
});

describe('shouldReleaseHeldItem', () => {
  const held = {
    heldId: 'a',
    requestedId: 'a' as string | null | undefined,
    hasResult: true,
    hasVerdict: true,
    pending: false,
    dockOpen: true,
  };

  it('holds the answered question under its own result', () => {
    expect(shouldReleaseHeldItem(held)).toBe(false);
  });

  it('never lets go while the answer is in flight', () => {
    // The flash the pin exists to prevent: the session drops the item optimistically, so
    // releasing mid-request resolves the queue to the next question and back again.
    expect(shouldReleaseHeldItem({ ...held, pending: true, hasResult: false, hasVerdict: false })).toBe(
      false,
    );
    expect(shouldReleaseHeldItem({ ...held, pending: true, dockOpen: false })).toBe(false);
    expect(shouldReleaseHeldItem({ ...held, pending: true, requestedId: 'b' })).toBe(false);
  });

  it('lets go when a different question is asked for by name', () => {
    /*
     * The reported bug. Answer A, leave without pressing "Next one", come back and tap row B:
     * the pointer said B and the card rendered A, and answering it again re-recorded an
     * outcome for an item that had already been rescheduled.
     */
    expect(shouldReleaseHeldItem({ ...held, requestedId: 'b', hasResult: false })).toBe(true);
  });

  it('lets go when the dock closes', () => {
    expect(shouldReleaseHeldItem({ ...held, dockOpen: false })).toBe(true);
  });

  it('lets go when the result was dismissed by some other path', () => {
    // `openReviewDock` nulls the result without touching the pin — a generic "Review" entry
    // point rather than a row tap, so there is no new id to compare against.
    expect(shouldReleaseHeldItem({ ...held, hasResult: false, hasVerdict: false })).toBe(true);
  });

  it('keeps the question up through a non-final miss', () => {
    // A verdict with no result is "wrong, but not out of goes". Same question, still up.
    expect(shouldReleaseHeldItem({ ...held, hasResult: false, hasVerdict: true })).toBe(false);
  });

  it('has nothing to do when nothing is pinned', () => {
    expect(shouldReleaseHeldItem({ ...held, heldId: null, dockOpen: false })).toBe(false);
  });

  it('does not yank the result away when the same row is tapped again', () => {
    // Re-opening on the question you just answered is not a request for a different one.
    expect(shouldReleaseHeldItem({ ...held, requestedId: 'a', hasVerdict: false })).toBe(false);
  });
});

describe('sittingIsStale', () => {
  const noon = Date.parse('2026-09-11T12:00:00Z');

  it('keeps a sitting fetched moments ago', () => {
    expect(sittingIsStale(noon - 60_000, noon)).toBe(false);
  });

  it('retires one left sitting for hours', () => {
    expect(sittingIsStale(noon - SITTING_STALE_MS, noon)).toBe(true);
  });

  it('retires one from a previous day even if the hours do not add up', () => {
    // A tab left open across midnight: two hours old, and yesterday's queue all the same.
    const justBeforeMidnight = Date.parse('2026-09-10T23:30:00');
    const justAfter = Date.parse('2026-09-11T01:00:00');
    expect(justAfter - justBeforeMidnight).toBeLessThan(SITTING_STALE_MS);
    expect(sittingIsStale(justBeforeMidnight, justAfter)).toBe(true);
  });

  it('says nothing about a sitting that has never been fetched', () => {
    expect(sittingIsStale(null, noon)).toBe(false);
    expect(sittingIsStale(0, noon)).toBe(false);
  });
});

describe('one more look at something missed', () => {
  const base = { outcome: 'revealed', practice: false, graded: true, finalized: true };

  it('brings back a question that ran out of goes', () => {
    expect(shouldReaskInSitting(base)).toBe(true);
  });

  it('leaves an almost alone', () => {
    /* It was already retried on the same card seconds ago, and it returns tomorrow anyway —
       asking again now is massed repetition wearing a spaced-repetition hat. */
    expect(shouldReaskInSitting({ ...base, outcome: 'almost' })).toBe(false);
    expect(shouldReaskInSitting({ ...base, outcome: 'recalled' })).toBe(false);
  });

  it('never re-asks a re-ask', () => {
    /* How "once" is structural rather than a counter: the second look is itself a practice
       answer, and a practice answer cannot spawn another. */
    expect(shouldReaskInSitting({ ...base, practice: true })).toBe(false);
  });

  it('wants a marked answer and a finished one', () => {
    expect(shouldReaskInSitting({ ...base, graded: false })).toBe(false);
    expect(shouldReaskInSitting({ ...base, finalized: false })).toBe(false);
  });
});

describe('reviewQuestionKey', () => {
  it('changes when the same item is asked again', () => {
    /* The dock resets its typed answer, verdict and revealed truth on this. Keyed on the id
       alone, a re-ask inherited all three from the question it was repeating. */
    const first = { id: 'r1', ladderStep: 2, reviewCount: 4 };
    expect(reviewQuestionKey(first)).not.toBe(reviewQuestionKey({ ...first, reviewCount: 5 }));
    expect(reviewQuestionKey(first)).not.toBe(reviewQuestionKey({ ...first, ladderStep: 3 }));
    expect(reviewQuestionKey(first)).toBe(reviewQuestionKey({ ...first }));
  });

  it('answers for nothing at all', () => {
    expect(reviewQuestionKey(null)).toBe('none');
  });
});

describe('sittingProgress', () => {
  const tally = (answered: number, practiced = 0) => ({ answered, holding: 0, practiced });

  it('counts what is done against what is done plus what is left', () => {
    const progress = sittingProgress(tally(3), 5);
    expect(progress).toMatchObject({ done: 3, total: 8, complete: false });
    expect(progress.fraction).toBeCloseTo(3 / 8);
  });

  it('grows the total when a missed question comes back', () => {
    /* Captured at the start, the bar would read "8 of 8" with two questions still on screen. */
    expect(sittingProgress(tally(8), 1).total).toBe(9);
  });

  it('counts a second look as work done', () => {
    expect(sittingProgress(tally(3, 1), 2)).toMatchObject({ done: 4, total: 6 });
  });

  it('is complete when the queue empties', () => {
    expect(sittingProgress(tally(6), 0).complete).toBe(true);
  });

  it('says nothing about an empty sitting', () => {
    expect(sittingProgress(tally(0), 0)).toMatchObject({ total: 0, fraction: 0, complete: false });
  });
});
