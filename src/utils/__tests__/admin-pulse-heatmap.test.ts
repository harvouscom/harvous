import { describe, expect, it } from 'vitest';
import { applyHeatLevels, buildCanonBookGrid } from '../admin-pulse-heatmap';

describe('buildCanonBookGrid', () => {
  it('returns 66 books with zero-filled counts', () => {
    const grid = buildCanonBookGrid([{ name: 'Psalms', count: 10 }]);
    expect(grid).toHaveLength(66);
    expect(grid.find((c) => c.name === 'Psalms')?.count).toBe(10);
    expect(grid.find((c) => c.name === 'Genesis')?.count).toBe(0);
  });

  it('normalizes heat from dominant book', () => {
    const grid = buildCanonBookGrid([
      { name: 'Psalms', count: 100 },
      { name: 'John', count: 50 },
    ]);
    const psalms = grid.find((c) => c.name === 'Psalms');
    const john = grid.find((c) => c.name === 'John');
    expect(psalms?.heatLevel).toBe(1);
    expect(john?.heatLevel).toBe(0.5);
    expect(psalms?.sharePct).toBeCloseTo(66.7, 0);
  });
});

describe('applyHeatLevels', () => {
  it('handles all-zero activity', () => {
    const cells = applyHeatLevels([
      { name: 'Genesis', order: 1, count: 0, sharePct: 0, heatLevel: 0 },
    ]);
    expect(cells[0]?.heatLevel).toBe(0);
    expect(cells[0]?.sharePct).toBe(0);
  });
});
