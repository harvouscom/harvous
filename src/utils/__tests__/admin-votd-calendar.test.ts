import { describe, expect, it } from 'vitest';
import {
  abbreviateScriptureReference,
  buildMonthGrid,
  formatUtcMonthLabel,
  shiftUtcMonth,
  utcMonthBounds,
} from '../admin-votd-calendar';

describe('utcMonthBounds', () => {
  it('returns first and last day for a UTC month', () => {
    expect(utcMonthBounds('2026-06')).toEqual({
      month: '2026-06',
      year: 2026,
      monthIndex: 5,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      dayCount: 30,
    });
  });

  it('handles February in a leap year', () => {
    expect(utcMonthBounds('2024-02')?.dayCount).toBe(29);
    expect(utcMonthBounds('2025-02')?.dayCount).toBe(28);
  });

  it('returns null for invalid month', () => {
    expect(utcMonthBounds('2026-13')).toBeNull();
    expect(utcMonthBounds('bad')).toBeNull();
  });
});

describe('shiftUtcMonth', () => {
  it('moves forward and backward across year boundary', () => {
    expect(shiftUtcMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftUtcMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftUtcMonth('2026-06', 1)).toBe('2026-07');
  });
});

describe('formatUtcMonthLabel', () => {
  it('formats month label', () => {
    expect(formatUtcMonthLabel('2026-06')).toBe('June 2026');
  });
});

describe('buildMonthGrid', () => {
  it('pads June 2026 with Sunday-start alignment', () => {
    const grid = buildMonthGrid('2026-06');
    expect(grid.length % 7).toBe(0);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(30);
    expect(grid[0]).toEqual({ date: null, inMonth: false });
    expect(grid[1]?.date).toBe('2026-06-01');
  });

  it('pads trailing cells to complete the last week', () => {
    const grid = buildMonthGrid('2026-04');
    expect(grid.length % 7).toBe(0);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(30);
    expect(grid.at(-1)?.inMonth).toBe(false);
  });
});

describe('abbreviateScriptureReference', () => {
  it('abbreviates common book names', () => {
    expect(abbreviateScriptureReference('Psalm 23:1-3')).toBe('Ps 23:1-3');
    expect(abbreviateScriptureReference('Romans 8:28')).toBe('Rom 8:28');
  });

  it('returns reference unchanged when book is unknown', () => {
    expect(abbreviateScriptureReference('Custom 1:1')).toBe('Custom 1:1');
  });
});
