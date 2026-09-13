import { describe, expect, it } from 'vitest';
import {
  SITTING_STALE_MS,
  canJudgeRecall,
  resolveReviewDockItem,
  shouldReleaseHeldItem,
  sittingIsStale,
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

  it('answers null rather than guessing when there is nothing due', () => {
    expect(resolveReviewDockItem('x', [], [])).toBeNull();
    expect(resolveReviewDockItem(null, [])).toBeNull();
  });
});

describe('canJudgeRecall', () => {
  it('lets someone judge after a written attempt', () => {
    expect(canJudgeRecall({ attempt: 'the spirit of adoption' })).toBe(true);
  });

  it('does not offer a verdict to someone who revealed cold', () => {
    // Writing is the whole signal. There is no button for "I had it in mind" — asking someone
    // to declare a mental state before checking it is the survey the strategy doc rules out.
    expect(canJudgeRecall({ attempt: '' })).toBe(false);
    expect(canJudgeRecall({ attempt: '   ' })).toBe(false);
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
