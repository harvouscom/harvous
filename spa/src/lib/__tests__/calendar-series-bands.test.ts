import { describe, expect, it } from 'vitest';
import { calendarSeriesBands } from '../planner-board';

/** A month grid is always whole weeks; these are two rows of seven. */
const cells = Array.from({ length: 14 }, (_, i) => ({
  iso: `2026-08-${String(i + 2).padStart(2, '0')}`,
}));

function plan(entries: Record<string, Array<[string, string]>>) {
  return new Map(
    Object.entries(entries).map(([iso, list]) => [
      iso,
      list.map(([seriesId, seriesTitle]) => ({ seriesId, seriesTitle })),
    ]),
  );
}

describe('calendarSeriesBands', () => {
  it('gives a weekly series one cell in each row it touches', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({ '2026-08-02': [['s1', 'Romans']], '2026-08-09': [['s1', 'Romans']] }),
    );

    expect(bands).toHaveLength(2);
    expect(bands[0]).toMatchObject({ row: 1, colStart: 1, colSpan: 1, seriesId: 's1' });
    expect(bands[1]).toMatchObject({ row: 2, colStart: 1, colSpan: 1, seriesId: 's1' });
  });

  it('spans first to last day when a run meets twice in one week', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({ '2026-08-02': [['s1', 'Camp']], '2026-08-05': [['s1', 'Camp']] }),
    );

    expect(bands).toHaveLength(1);
    // Sunday through Wednesday — the gap belongs to the run too.
    expect(bands[0]).toMatchObject({ row: 1, colStart: 1, colSpan: 4 });
  });

  it('never spans a row break, because a month grid wraps', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({ '2026-08-08': [['s1', 'Advent']], '2026-08-09': [['s1', 'Advent']] }),
    );

    // The 8th ends row one and the 9th opens row two: two bands, not one
    // stretched across a line break grid cannot draw.
    expect(bands).toHaveLength(2);
    expect(bands[0]).toMatchObject({ row: 1, colStart: 7, colSpan: 1 });
    expect(bands[1]).toMatchObject({ row: 2, colStart: 1, colSpan: 1 });
  });

  it('keeps two series in one row apart', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({ '2026-08-02': [['s1', 'Romans']], '2026-08-04': [['s2', 'Psalms']] }),
    );

    expect(bands.map((b) => b.seriesId).sort()).toEqual(['s1', 's2']);
  });

  it('ignores weeks with no series rather than banding them', () => {
    const bands = calendarSeriesBands(cells, plan({ '2026-08-02': [[null as never, 'Standalone']] }));
    expect(bands).toEqual([]);
  });

  it('carries the run name for the band label', () => {
    const bands = calendarSeriesBands(cells, plan({ '2026-08-02': [['s1', 'Romans']] }));
    expect(bands[0].label).toBe('Romans');
  });
});
