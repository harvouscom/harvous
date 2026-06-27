import { describe, expect, it } from 'vitest';
import { nextRecallStabilityDays, STABILITY_GROWTH_FACTOR, MAX_STABILITY_DAYS } from '../note-recall-state';
import { DEFAULT_BASE_STABILITY_DAYS } from '@/utils/prototype-home-trends';

describe('nextRecallStabilityDays', () => {
  it('grows from the base on first engagement', () => {
    expect(nextRecallStabilityDays(null)).toBe(DEFAULT_BASE_STABILITY_DAYS * STABILITY_GROWTH_FACTOR);
  });

  it('grows multiplicatively and caps at MAX_STABILITY_DAYS', () => {
    expect(nextRecallStabilityDays(20)).toBe(40);
    expect(nextRecallStabilityDays(150)).toBe(MAX_STABILITY_DAYS);
  });
});
