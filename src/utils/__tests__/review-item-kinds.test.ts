import { describe, it, expect } from 'vitest';
import {
  REVIEW_EVENT_ACTIONS,
  REVIEW_MAX_ATTEMPTS,
  REVIEW_OUTCOMES,
  isReviewEventAction,
  isReviewOutcome,
  maxAttemptsFor,
} from '@/utils/review-item-kinds';
import { REVIEW_PROMPT_KEYS } from '@/utils/review-prompts';

describe('how many goes a question gets', () => {
  it('gives a four-option tap two, because a third leaves one option', () => {
    for (const key of ['verse.recognize', 'verse.locate', 'verse.next', 'note.recognize']) {
      expect(maxAttemptsFor(key)).toBe(2);
    }
  });

  it('gives anything produced three, since guessing has no floor there', () => {
    for (const key of ['verse.rebuild', 'verse.keywords', 'verse.initials', 'verse.recall']) {
      expect(maxAttemptsFor(key)).toBe(3);
    }
  });

  it('never exceeds the ceiling every bound is written against', () => {
    for (const key of REVIEW_PROMPT_KEYS) {
      expect(maxAttemptsFor(key)).toBeLessThanOrEqual(REVIEW_MAX_ATTEMPTS);
      expect(maxAttemptsFor(key)).toBeGreaterThanOrEqual(2);
    }
    expect(maxAttemptsFor(null)).toBe(3);
  });
});

describe('a rating of the question is not an answer', () => {
  /*
   * `liked` and `disliked` are about the exercise the app chose, not about how the recall went.
   * They live in the same log, so everything that reads the log for what a reader *did* must go
   * through the narrower `REVIEW_OUTCOMES` — which is how `study-feed.ts` reads it.
   */
  it('carries the two feedback actions', () => {
    expect(REVIEW_EVENT_ACTIONS).toContain('liked');
    expect(REVIEW_EVENT_ACTIONS).toContain('disliked');
    expect(isReviewEventAction('disliked')).toBe(true);
  });

  it('keeps them out of the outcomes', () => {
    expect(REVIEW_OUTCOMES).not.toContain('liked');
    expect(REVIEW_OUTCOMES).not.toContain('disliked');
    expect(isReviewOutcome('disliked')).toBe(false);
  });

  it('appends them rather than inserting, so stored rows keep their meaning', () => {
    // The list's order is its identity for anything that reads it positionally.
    expect(REVIEW_EVENT_ACTIONS.slice(0, 8)).toEqual([
      'shown',
      'recalled',
      'almost',
      'revealed',
      'deferred',
      'paused',
      'resumed',
      'archived',
    ]);
  });
});
