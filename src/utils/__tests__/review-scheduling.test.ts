import { describe, it, expect } from 'vitest';
import {
  MAX_REVIEW_INTERVAL_DAYS,
  REVIEW_INTERVAL_DAYS,
  REVIEW_LEECH_LAPSES,
  REVIEW_RUNG_WEIGHT,
  lapseDamping,
  rungWeight,
  stepBackRung,
  STREAK_MULTIPLIER,
  STREAK_MULTIPLIER_FROM,
  addDays,
  deferReview,
  deriveRecallState,
  describeNextReturn,
  describeNextDue,
  firstDueAt,
  firstDueAtFor,
  NEVER_LAPSES,
  nextReviewAfter,
} from '../review-scheduling';
import { REVIEW_PROMPT_KEYS } from '../review-prompts';

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
  it('waits a night before asking about a note the reader just added', () => {
    // They added it while looking at it; asking now would be asking about what is on screen.
    expect(daysBetween(NOW, firstDueAt(NOW))).toBe(1);
    expect(daysBetween(NOW, firstDueAt(NOW, 'user'))).toBe(1);
  });

  it('offers a seeded item at once, so the cold start has something to show', () => {
    // Tapping "Start reviewing" and watching the section empty itself is what this fixes.
    expect(firstDueAt(NOW, 'seed').getTime()).toBe(NOW.getTime());
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

describe('rung weight', () => {
  const held = { intervalDays: 14, successStreak: 0, reviewCount: 1 };

  it('scales a clean recall by the rung, and nothing else', () => {
    expect(nextReviewAfter('recalled', { ...held, rungKey: 'verse.recognize' }, NOW).intervalDays).toBeCloseTo(8.4);
    // Locate is a four-option tap, so its weight sits below 1 like the other choice rungs —
    // the rung reads harder than its exercise is.
    expect(nextReviewAfter('recalled', { ...held, rungKey: 'verse.locate' }, NOW).intervalDays).toBeCloseTo(11.2);
    // Producing the verse from nothing is the one that buys the long interval.
    expect(nextReviewAfter('recalled', { ...held, rungKey: 'verse.recall' }, NOW).intervalDays).toBeCloseTo(16.8);
    // A miss is a day whatever the rung: nothing was retrieved, so there is nothing to weigh.
    expect(nextReviewAfter('revealed', { ...held, rungKey: 'verse.locate' }, NOW).intervalDays).toBe(1);
    expect(nextReviewAfter('almost', { ...held, rungKey: 'verse.locate' }, NOW).intervalDays).toBe(4);
  });

  it('treats an unknown or absent rung as the plain base', () => {
    expect(nextReviewAfter('recalled', held, NOW).intervalDays).toBe(14);
    expect(nextReviewAfter('recalled', { ...held, rungKey: 'verse.nope' }, NOW).intervalDays).toBe(14);
    expect(rungWeight(null)).toBe(1);
  });

  it('names every rung, so a new exercise cannot silently weigh one', () => {
    for (const key of REVIEW_PROMPT_KEYS) expect(REVIEW_RUNG_WEIGHT[key]).toBeGreaterThan(0);
  });
});

describe('lapses', () => {
  it('does not count a first-ever miss, or a miss on something never held', () => {
    expect(nextReviewAfter('revealed', fresh, NOW).lapseCount).toBe(0);
    expect(
      nextReviewAfter('revealed', { intervalDays: 1, successStreak: 0, reviewCount: 3, lapseCount: 0 }, NOW).lapseCount,
    ).toBe(0);
  });

  it('counts a miss on something held the last time it was asked', () => {
    const heldOnce = { intervalDays: 14, successStreak: 1, reviewCount: 2 };
    const missed = nextReviewAfter('revealed', heldOnce, NOW);
    expect(missed.lapseCount).toBe(1);
    expect(missed.leech).toBe(false);
    // "Almost" retrieved something; it ends the streak but is not a lapse.
    expect(nextReviewAfter('almost', heldOnce, NOW).lapseCount).toBe(0);
  });

  it('never lapses on the theme rung, whose key is the index and not the reader', () => {
    const heldOnce = { intervalDays: 14, successStreak: 1, reviewCount: 2, lapseCount: 3 };
    expect(nextReviewAfter('revealed', { ...heldOnce, rungKey: 'verse.theme' }, NOW).lapseCount).toBe(3);
    expect(nextReviewAfter('revealed', { ...heldOnce, rungKey: 'verse.person' }, NOW).lapseCount).toBe(4);
  });

  it('damps compounding by 15% a lapse, never below half', () => {
    const compounding = { intervalDays: 14, successStreak: 2, reviewCount: 5 };
    const clean = nextReviewAfter('recalled', compounding, NOW).intervalDays;
    const lapsedOnce = nextReviewAfter('recalled', { ...compounding, lapseCount: 1 }, NOW).intervalDays;
    const lapsedTen = nextReviewAfter('recalled', { ...compounding, lapseCount: 10 }, NOW).intervalDays;
    expect(clean).toBeCloseTo(14 * STREAK_MULTIPLIER, 1);
    expect(lapsedOnce).toBeCloseTo(clean * 0.85, 1);
    expect(lapsedTen).toBeCloseTo(clean * 0.5, 1);
    expect(lapseDamping(0)).toBe(1);
    // Lapses stay on the record through a recall; a clean answer does not forgive them.
    expect(nextReviewAfter('recalled', { ...compounding, lapseCount: 2 }, NOW).lapseCount).toBe(2);
  });

  it('does not damp below the base on the first recalls', () => {
    const early = { intervalDays: 1, successStreak: 0, reviewCount: 4, lapseCount: 3 };
    expect(nextReviewAfter('recalled', early, NOW).intervalDays).toBe(14);
  });
});

describe('leeches', () => {
  const slippingSoon = { intervalDays: 14, successStreak: 1, reviewCount: 8, lapseCount: REVIEW_LEECH_LAPSES - 1 };

  it('flags the fourth lapse, and reads as slipping', () => {
    const result = nextReviewAfter('revealed', slippingSoon, NOW);
    expect(result.leech).toBe(true);
    expect(result.lapseCount).toBe(REVIEW_LEECH_LAPSES);
    expect(result.recallState).toBe('slipping');
  });

  it('is not flagged again by a miss that did not lapse', () => {
    // Missed while never re-held since: still slipping, but no new leech moment to announce.
    const stillDown = { ...slippingSoon, successStreak: 0, lapseCount: REVIEW_LEECH_LAPSES };
    const result = nextReviewAfter('revealed', stillDown, NOW);
    expect(result.leech).toBe(false);
    expect(result.recallState).toBe('slipping');
  });

  it('stops reading as slipping once it is held again', () => {
    expect(deriveRecallState({ reviewCount: 9, successStreak: 1, lapseCount: 4 })).toBe('slipping');
    expect(deriveRecallState({ reviewCount: 9, successStreak: STREAK_MULTIPLIER_FROM, lapseCount: 4 })).toBe('durable');
  });

  it('steps back one rung and forgives the lapses, and nothing else', () => {
    expect(stepBackRung({ ladderStep: 5, reviewCount: 9, successStreak: 0 })).toEqual({
      ladderStep: 4,
      lapseCount: 0,
      recallState: 'fragile',
    });
    expect(stepBackRung({ ladderStep: 0, reviewCount: 9, successStreak: 0 }).ladderStep).toBe(0);
  });
});

describe('firstDueAtFor', () => {
  const NOW = new Date('2026-09-04T12:00:00Z');
  it('always makes a chapter wait a night, whoever added it', () => {
    // The chapter's text may still be on screen; asking today is asking about the open page.
    for (const origin of ['user', 'engine', 'seed'] as const) {
      expect(firstDueAtFor('chapter', origin, NOW).getTime() - NOW.getTime()).toBe(86_400_000);
    }
  });
  it('leaves every other kind on the origin rule', () => {
    expect(firstDueAtFor('verse', 'engine', NOW).getTime()).toBe(firstDueAt(NOW, 'engine').getTime());
    expect(firstDueAtFor('note', 'user', NOW).getTime()).toBe(firstDueAt(NOW, 'user').getTime());
  });
  it('never counts a disagreement with the index as forgetting', () => {
    expect(NEVER_LAPSES.has('chapter.person')).toBe(true);
  });
});

describe('describeNextDue', () => {
  const NOW = new Date('2026-09-04T12:00:00');
  const at = (iso: string) => describeNextDue(iso, NOW);

  it('names a weekday within the week, because "in 5 days" is arithmetic', () => {
    expect(at('2026-09-07T09:00:00')).toMatch(/^on \w+$/);
  });

  it('says today and tomorrow the way a person does', () => {
    expect(at('2026-09-04T20:00:00')).toBe('later today');
    expect(at('2026-09-05T06:00:00')).toBe('tomorrow');
  });

  it('gives a date once the weekday would be ambiguous', () => {
    // At seven days the weekday named is today's own, so it stops being a memory and
    // becomes a riddle.
    expect(at('2026-09-11T09:00:00')).toMatch(/September|Sept|9/);
  });

  it('promises nothing about something already due, or a date it cannot read', () => {
    expect(at('2026-09-04T11:00:00')).toBeNull();
    expect(at('not a date')).toBeNull();
    expect(describeNextDue(null, NOW)).toBeNull();
  });
});
