import { describe, it, expect } from 'vitest';
import { REVIEW_MAX_ATTEMPTS, maxAttemptsFor } from '@/utils/review-item-kinds';
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
