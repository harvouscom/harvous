/**
 * The rotating compose prompt's lines: short enough for a phone, and a start that moves by day.
 */
import { describe, expect, it } from 'vitest';
import { FEED_COMPOSE_PROMPTS, feedComposeStartIndex } from '../PrototypeFeedComposePrompt';

describe('feed compose prompts', () => {
  it('fit on one line at phone width', () => {
    // ~300px of label at 15px holds about 34 characters before the ellipsis.
    for (const line of FEED_COMPOSE_PROMPTS) expect(line.length).toBeLessThanOrEqual(34);
  });

  it('start on a different line from one day to the next, and repeat by the cycle', () => {
    const day = new Date(2026, 8, 18, 9);
    const next = new Date(2026, 8, 19, 9);
    const later = new Date(2026, 8, 18 + FEED_COMPOSE_PROMPTS.length, 9);
    expect(feedComposeStartIndex(next)).not.toBe(feedComposeStartIndex(day));
    expect(feedComposeStartIndex(later)).toBe(feedComposeStartIndex(day));
  });

  it('keeps the same line all day', () => {
    expect(feedComposeStartIndex(new Date(2026, 8, 18, 0, 5))).toBe(
      feedComposeStartIndex(new Date(2026, 8, 18, 23, 55)),
    );
  });
});
