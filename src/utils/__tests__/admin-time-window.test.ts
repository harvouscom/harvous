import { describe, expect, it } from 'vitest';
import {
  adminWindowPreviousRange,
  adminWindowSince,
  clampAdminDays,
} from '../../../server/utils/admin-time-window';

describe('adminWindowSince', () => {
  it('includes today in a 7-day inclusive window', () => {
    const since = adminWindowSince(7);
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const expected = new Date(now);
    expected.setUTCDate(expected.getUTCDate() - 6);
    expect(since.toISOString()).toBe(expected.toISOString());
  });

  it('aligns overview and trends length', () => {
    expect(adminWindowSince(14).getTime()).toBeLessThanOrEqual(Date.now());
    expect(clampAdminDays(120)).toBe(90);
    expect(clampAdminDays(0)).toBe(1);
  });
});

describe('adminWindowPreviousRange', () => {
  it('returns a prior window of equal length ending at current since', () => {
    const { since, until } = adminWindowPreviousRange(7);
    const currentSince = adminWindowSince(7);
    expect(until.toISOString()).toBe(currentSince.toISOString());
    const diffDays = Math.round((until.getTime() - since.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(7);
  });
});
