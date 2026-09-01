import { describe, it, expect } from 'vitest';
import {
  MAX_REVIEW_INTERVAL_DAYS,
  REVIEW_INTERVAL_DAYS,
  STREAK_MULTIPLIER,
  STREAK_MULTIPLIER_FROM,
  addDays,
  deferReview,
  deriveRecallState,
  describeNextReturn,
  firstDueAt,
  nextReviewAfter,
} from '../review-scheduling';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const fresh = { intervalDays: 1, successStreak: 0, reviewCount: 0 };

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

describe('nextReviewAfter', () => {
  it('uses the documented base intervals', () => {
    expect(daysBetween(NOW, nextReviewAfter('revealed', fresh, NOW).dueAt)).toBe(1);
    expect(daysBetween(NOW, nextReviewAfter('almost', fresh, NOW).dueAt)).toBe(4);
    expect(daysBetween(NOW, nextReviewAfter('recalled', fresh, NOW).dueAt)).toBe(14);
    expect(REVIEW_INTERVAL_DAYS).toEqual({ revealed: 1, almost: 4, recalled: 14 });
  });

  it('does not compound before the third consecutive recall', () => {
    const second = nextReviewAfter('recalled', { intervalDays: 14, successStreak: 1, reviewCount: 1 }, NOW);
    expect(second.successStreak).toBe(2);
    expect(second.intervalDays).toBe(14);
  });

  it('compounds from the third recall, off the previous interval', () => {
    const third = nextReviewAfter('recalled', { intervalDays: 14, successStreak: 2, reviewCount: 2 }, NOW);
    expect(third.successStreak).toBe(STREAK_MULTIPLIER_FROM);
    expect(third.intervalDays).toBeCloseTo(14 * STREAK_MULTIPLIER, 5);

    const fourth = nextReviewAfter('recalled', { intervalDays: 25.2, successStreak: 3, reviewCount: 3 }, NOW);
    expect(fourth.intervalDays).toBeCloseTo(25.2 * STREAK_MULTIPLIER, 1);
  });

  it('never compounds below the recalled base', () => {
    const early = nextReviewAfter('recalled', { intervalDays: 2, successStreak: 5, reviewCount: 5 }, NOW);
    expect(early.intervalDays).toBeCloseTo(14 * STREAK_MULTIPLIER, 5);
  });

  it('caps the interval at six months', () => {
    const capped = nextReviewAfter('recalled', { intervalDays: 170, successStreak: 9, reviewCount: 9 }, NOW);
    expect(capped.intervalDays).toBe(MAX_REVIEW_INTERVAL_DAYS);
  });

  it('resets the streak on anything short of a clean recall', () => {
    const missed = nextReviewAfter('almost', { intervalDays: 60, successStreak: 6, reviewCount: 6 }, NOW);
    expect(missed.successStreak).toBe(0);
    expect(missed.intervalDays).toBe(4);
    expect(missed.recallState).toBe('fragile');
  });

  it('counts every answer as a review', () => {
    expect(nextReviewAfter('revealed', fresh, NOW).reviewCount).toBe(1);
    expect(nextReviewAfter('recalled', { ...fresh, reviewCount: 7 }, NOW).reviewCount).toBe(8);
  });
});

describe('deriveRecallState', () => {
  it('moves new → fragile → forming → durable', () => {
    expect(deriveRecallState({ reviewCount: 0, successStreak: 0 })).toBe('new');
    expect(deriveRecallState({ reviewCount: 1, successStreak: 0, lastOutcome: 'revealed' })).toBe('fragile');
    expect(deriveRecallState({ reviewCount: 2, successStreak: 1, lastOutcome: 'recalled' })).toBe('forming');
    expect(deriveRecallState({ reviewCount: 3, successStreak: 2, lastOutcome: 'recalled' })).toBe('forming');
    expect(deriveRecallState({ reviewCount: 4, successStreak: 3, lastOutcome: 'recalled' })).toBe('durable');
  });

  it('drops a durable item straight back to fragile on one miss', () => {
    const missed = nextReviewAfter('revealed', { intervalDays: 90, successStreak: 8, reviewCount: 8 }, NOW);
    expect(missed.recallState).toBe('fragile');
  });
});

describe('deferReview', () => {
  it('adds a day and changes nothing else', () => {
    const dueAt = new Date('2026-08-30T12:00:00.000Z');
    expect(daysBetween(NOW, deferReview({ dueAt }, NOW).dueAt)).toBe(1);
  });

  it('defers from a future due date rather than pulling it forward', () => {
    const dueAt = addDays(NOW, 10);
    expect(daysBetween(NOW, deferReview({ dueAt }, NOW).dueAt)).toBe(11);
  });
});

describe('firstDueAt', () => {
  it('waits a night before asking about a note just added', () => {
    expect(daysBetween(NOW, firstDueAt(NOW))).toBe(1);
  });
});

describe('describeNextReturn', () => {
  it('speaks in plain time, never in counts', () => {
    expect(describeNextReturn(1)).toBe('Back tomorrow');
    expect(describeNextReturn(4)).toBe('Back in 4 days');
    expect(describeNextReturn(14)).toBe('Back in 2 weeks');
    expect(describeNextReturn(180)).toBe('Back in 6 months');
  });
});
