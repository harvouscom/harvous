import { describe, expect, it } from 'vitest';
import {
  formatTrendTick,
  mergeTrendPoints,
  projectLinearTrend,
  shouldProjectSeries,
} from '../admin-usage-trends-chart';

describe('formatTrendTick', () => {
  it('formats thousands compactly', () => {
    expect(formatTrendTick(1200)).toBe('1.2k');
    expect(formatTrendTick(5000)).toBe('5k');
  });

  it('leaves small values as-is', () => {
    expect(formatTrendTick(42)).toBe('42');
    expect(formatTrendTick(0)).toBe('0');
  });
});

describe('mergeTrendPoints', () => {
  it('merges daily series by date', () => {
    const signups = [
      { date: '2026-06-27', count: 2 },
      { date: '2026-06-28', count: 5 },
    ];
    const notes = [{ date: '2026-06-28', count: 10 }];
    const active = [{ date: '2026-06-28', count: 3 }];
    const scripture = [{ date: '2026-06-28', count: 7 }];
    const recall = [{ date: '2026-06-28', count: 1 }];

    expect(mergeTrendPoints(signups, notes, active, scripture, recall, 2)).toEqual([
      {
        date: '2026-06-27',
        label: '06-27',
        signups: 2,
        notes: 0,
        activeUsers: 0,
        scripturePills: 0,
        recallOpens: 0,
      },
      {
        date: '2026-06-28',
        label: '06-28',
        signups: 5,
        notes: 10,
        activeUsers: 3,
        scripturePills: 7,
        recallOpens: 1,
      },
    ]);
  });
});

describe('projectLinearTrend', () => {
  it('projects upward slope', () => {
    const values = [1, 2, 3, 4, 5];
    expect(projectLinearTrend(values, 3)).toEqual([6, 7, 8]);
  });

  it('clamps negative projections to zero', () => {
    const values = [10, 8, 6, 4, 2];
    const projected = projectLinearTrend(values, 3);
    expect(projected.every((v) => v >= 0)).toBe(true);
    expect(projected[0]).toBe(0);
  });

  it('returns empty when horizon is zero', () => {
    expect(projectLinearTrend([1, 2, 3], 0)).toEqual([]);
  });
});

describe('shouldProjectSeries', () => {
  it('requires at least three non-zero points', () => {
    expect(shouldProjectSeries([0, 1, 0, 2])).toBe(false);
    expect(shouldProjectSeries([0, 1, 2, 3])).toBe(true);
  });
});
