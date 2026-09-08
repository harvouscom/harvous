/**
 * The cases that matter are the drags that are *not* swipes. A false positive here changes the
 * words under someone who was scrolling, which is far worse than a swipe that needs repeating.
 */
import { describe, expect, it } from 'vitest';
import {
  swipeDirection,
  SWIPE_MIN_DISTANCE,
  SWIPE_DOMINANCE,
} from '../reader-version-swipe';

describe('swipeDirection', () => {
  it('reads a clear drag across the page', () => {
    expect(swipeDirection(-120, 4)).toBe('left');
    expect(swipeDirection(120, -4)).toBe('right');
  });

  it('ignores a drag that did not go far enough', () => {
    /* A tap wanders a few pixels, and a verse tap must stay a verse tap. */
    expect(swipeDirection(-20, 0)).toBeNull();
    expect(swipeDirection(SWIPE_MIN_DISTANCE - 1, 0)).toBeNull();
    expect(swipeDirection(SWIPE_MIN_DISTANCE, 0)).toBe('right');
  });

  it('ignores a scroll, however far sideways the thumb arced', () => {
    /* The load-bearing case: this is a flick down the page, not a swap. */
    expect(swipeDirection(-80, 400)).toBeNull();
    expect(swipeDirection(70, -300)).toBeNull();
  });

  it('needs the horizontal to clearly beat the vertical, not merely to lead', () => {
    // Exactly at the ratio counts; a hair under does not.
    const dy = 60;
    expect(swipeDirection(dy * SWIPE_DOMINANCE, dy)).toBe('right');
    expect(swipeDirection(dy * SWIPE_DOMINANCE - 1, dy)).toBeNull();
  });

  it('treats a perfectly still drag as nothing', () => {
    expect(swipeDirection(0, 0)).toBeNull();
  });

  it('is symmetric about the vertical direction', () => {
    // Up or down should not change whether a sideways drag counts.
    expect(swipeDirection(-100, 40)).toBe(swipeDirection(-100, -40));
  });
});
