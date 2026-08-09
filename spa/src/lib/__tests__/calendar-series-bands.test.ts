import { describe, expect, it } from 'vitest';
import { calendarBandLanesByRow, calendarSeriesBands } from '../planner-board';

/** A month grid is always whole weeks; these are three rows of seven. */
const cells = Array.from({ length: 21 }, (_, i) => ({
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
  it('spans the days between two Sundays — a run is a period, not two dots', () => {
    const bands = calendarSeriesBands(
      cells,
      // Sunday the 2nd and Sunday the 9th: consecutive rows, same run.
      plan({ '2026-08-02': [['s1', 'Romans']], '2026-08-09': [['s1', 'Romans']] }),
    );

    expect(bands).toHaveLength(2);
    // Row one runs from the 2nd to the end of the week.
    expect(bands[0]).toMatchObject({ row: 1, colStart: 1, colSpan: 7, continuesToNext: true });
    // Row two opens the week and stops on the 9th.
    expect(bands[1]).toMatchObject({ row: 2, colStart: 1, colSpan: 1, continuesFromPrev: true });
  });

  it('fills whole rows in the middle of a long run', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({ '2026-08-02': [['s1', 'Romans']], '2026-08-16': [['s1', 'Romans']] }),
    );

    expect(bands).toHaveLength(3);
    const middle = bands[1];
    expect(middle).toMatchObject({
      row: 2,
      colStart: 1,
      colSpan: 7,
      continuesFromPrev: true,
      continuesToNext: true,
    });
  });

  it('never crosses a row break, because a month grid wraps', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({ '2026-08-08': [['s1', 'Advent']], '2026-08-09': [['s1', 'Advent']] }),
    );

    // The 8th ends row one, the 9th opens row two — two bands, not one
    // stretched across a line break grid cannot draw.
    expect(bands).toHaveLength(2);
    expect(bands[0]).toMatchObject({ row: 1, colStart: 7, colSpan: 1, continuesToNext: true });
    expect(bands[1]).toMatchObject({ row: 2, colStart: 1, colSpan: 1, continuesFromPrev: true });
  });

  it('gives a single-week run one band that does not claim to continue', () => {
    const bands = calendarSeriesBands(cells, plan({ '2026-08-05': [['s1', 'One off']] }));

    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({
      row: 1,
      colSpan: 1,
      continuesFromPrev: false,
      continuesToNext: false,
    });
  });

  it('keeps two runs in one row apart', () => {
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

  it('stacks overlapping runs on separate lanes so neither bleeds', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({
        // A run across the whole first week…
        '2026-08-02': [['s1', 'Romans']],
        '2026-08-08': [['s1', 'Romans']],
        // …and a midweek one inside it.
        '2026-08-05': [['s2', 'Wednesdays']],
      }),
    );

    const romans = bands.find((b) => b.seriesId === 's1');
    const midweek = bands.find((b) => b.seriesId === 's2');
    expect(romans!.lane).toBe(0);
    expect(midweek!.lane).toBe(1);
  });

  it('lets runs that never touch share the top lane', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({ '2026-08-02': [['s1', 'Early']], '2026-08-07': [['s2', 'Late']] }),
    );

    // Sunday and Friday do not overlap, so neither is pushed down.
    expect(bands.every((b) => b.lane === 0)).toBe(true);
  });

  it('gives the longer run the top lane, not whoever is first', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({
        // Both start on the 2nd, so they genuinely collide — the short one
        // would take lane 0 on document order alone.
        '2026-08-02': [
          ['short', 'One day'],
          ['long', 'All week'],
        ],
        '2026-08-08': [['long', 'All week']],
      }),
    );

    expect(bands.find((b) => b.seriesId === 'long')!.lane).toBe(0);
    expect(bands.find((b) => b.seriesId === 'short')!.lane).toBe(1);
  });

  it('reports how many lines each row needs', () => {
    const bands = calendarSeriesBands(
      cells,
      plan({
        '2026-08-02': [['s1', 'A']],
        '2026-08-08': [['s1', 'A']],
        '2026-08-05': [['s2', 'B']],
        '2026-08-16': [['s3', 'C']],
      }),
    );

    const lanes = calendarBandLanesByRow(bands);
    expect(lanes[0]).toBe(2); // two overlapping runs in week one
    expect(lanes[2]).toBe(1); // one run in week three
  });

  it('carries the run name for the band label', () => {
    const bands = calendarSeriesBands(cells, plan({ '2026-08-02': [['s1', 'Romans']] }));
    expect(bands[0].label).toBe('Romans');
  });
});
