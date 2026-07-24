import { describe, expect, it } from 'vitest';
import { conceptOverlaps } from '../bible-study-concept-overlaps';

describe('conceptOverlaps', () => {
  it('Exodus book name does not overlap The Exodus narrative folder label', () => {
    expect(conceptOverlaps('Exodus', 'The Exodus')).toBe(false);
  });

  it('still overlaps truly adjacent concepts', () => {
    expect(conceptOverlaps('Salvation', 'Redemption')).toBe(true);
  });
});
