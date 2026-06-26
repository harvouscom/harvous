import { describe, expect, it, beforeEach } from 'vitest';
import {
  nextStability,
  recordRecallEngaged,
  stabilityById,
  STABILITY_GROWTH_FACTOR,
  MAX_STABILITY_DAYS,
} from '../proto-recall-stability';
import { DEFAULT_BASE_STABILITY_DAYS } from '@/utils/prototype-home-trends';

const SPACE = 'space_home';

describe('nextStability', () => {
  it('grows from the base on first engagement', () => {
    expect(nextStability(undefined)).toBe(DEFAULT_BASE_STABILITY_DAYS * STABILITY_GROWTH_FACTOR);
  });

  it('grows multiplicatively from the current value', () => {
    expect(nextStability(20)).toBe(40);
  });

  it('caps at MAX_STABILITY_DAYS', () => {
    expect(nextStability(150)).toBe(MAX_STABILITY_DAYS);
  });

  it('treats invalid/zero current as the base', () => {
    expect(nextStability(0)).toBe(DEFAULT_BASE_STABILITY_DAYS * STABILITY_GROWTH_FACTOR);
    expect(nextStability(Number.NaN)).toBe(DEFAULT_BASE_STABILITY_DAYS * STABILITY_GROWTH_FACTOR);
  });
});

describe('proto-recall-stability store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records and lengthens stability on repeated engagement', () => {
    recordRecallEngaged(SPACE, 'note_a');
    expect(stabilityById(SPACE).note_a).toBe(DEFAULT_BASE_STABILITY_DAYS * 2);
    recordRecallEngaged(SPACE, 'note_a');
    expect(stabilityById(SPACE).note_a).toBe(DEFAULT_BASE_STABILITY_DAYS * 4);
  });

  it('is space-scoped and no-ops without a space or id', () => {
    recordRecallEngaged(SPACE, 'note_a');
    expect(stabilityById('other_space').note_a).toBeUndefined();
    recordRecallEngaged(null, 'note_a');
    recordRecallEngaged(SPACE, '');
    expect(Object.keys(stabilityById(SPACE))).toEqual(['note_a']);
  });
});
