import { describe, expect, it } from 'vitest';
import {
  FREE_HISTORY_GRACE_DAYS,
  FREE_HISTORY_VISIBLE_DAYS,
  FREE_HISTORY_WINDOW_DAYS,
} from '@/lib/billing-plans';
import { freeHistoryFloor, freeHistoryGraceStart } from '../history-window-status';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-01T12:00:00Z');

describe('free history window bands', () => {
  it('promises 90 days and lands softly over a 7-day grace', () => {
    expect(FREE_HISTORY_WINDOW_DAYS).toBe(90);
    expect(FREE_HISTORY_GRACE_DAYS).toBe(7);
    expect(FREE_HISTORY_VISIBLE_DAYS).toBe(97);
  });

  it('hides only what is older than window + grace; the band between is "leaving soon"', () => {
    expect(NOW.getTime() - freeHistoryFloor(NOW).getTime()).toBe(97 * DAY);
    expect(NOW.getTime() - freeHistoryGraceStart(NOW).getTime()).toBe(90 * DAY);
    expect(freeHistoryFloor(NOW).getTime()).toBeLessThan(freeHistoryGraceStart(NOW).getTime());
  });
});
