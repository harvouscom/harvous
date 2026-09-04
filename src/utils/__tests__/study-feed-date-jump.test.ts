/**
 * What a date jump should do when the day it names has not been fetched yet.
 *
 * The interesting cases are all the ones where the day is *not* in the stack: that is the
 * difference between a picker that works and one that appears to do nothing.
 */
import { describe, expect, it } from 'vitest';
import { studyFeedJumpStep } from '../study-feed-date-jump';

/** Newest first, which is the order the stack is built in. */
const days = [{ dayKey: '2026-08-29' }, { dayKey: '2026-08-28' }, { dayKey: '2026-08-27' }];

describe('a day already in the stack', () => {
  it('is an index to move to', () => {
    expect(studyFeedJumpStep({ days, targetDayKey: '2026-08-28', hasMore: true })).toEqual({
      action: 'jump',
      index: 1,
    });
  });

  it('resolves the oldest loaded day too', () => {
    expect(studyFeedJumpStep({ days, targetDayKey: '2026-08-27', hasMore: true })).toEqual({
      action: 'jump',
      index: 2,
    });
  });
});

describe('a day behind the stack', () => {
  it('asks for another page while there is one', () => {
    expect(studyFeedJumpStep({ days, targetDayKey: '2026-07-04', hasMore: true })).toEqual({
      action: 'fetch',
    });
  });

  it('settles on the oldest sheet once there is nothing more to fetch', () => {
    /*
     * The study does not go back that far. Landing on the oldest is the honest answer;
     * doing nothing would read as a mis-tap.
     */
    expect(studyFeedJumpStep({ days, targetDayKey: '2026-07-04', hasMore: false })).toEqual({
      action: 'settle',
      index: 2,
    });
  });
});

describe('a day ahead of the stack', () => {
  it('never asks for more, because pages only go backwards', () => {
    /*
     * The picker's ceiling should make this unreachable. This is the guard that keeps a bug
     * there costing a wrong landing rather than a fetch loop that never terminates.
     */
    expect(studyFeedJumpStep({ days, targetDayKey: '2026-09-15', hasMore: true })).toEqual({
      action: 'jump',
      index: 0,
    });
  });
});

describe('an empty stack', () => {
  it('has nowhere to go', () => {
    expect(studyFeedJumpStep({ days: [], targetDayKey: '2026-08-29', hasMore: true })).toEqual({
      action: 'none',
    });
  });
});
