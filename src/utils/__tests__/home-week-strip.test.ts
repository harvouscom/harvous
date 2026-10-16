import { describe, expect, it } from 'vitest';
import { buildWeekStrip, weekStripLabel, weekStripLine, weekStripNeedsOlder } from '../home-week-strip';
import type { StudyFeedDay } from '../study-feed-items';

const now = new Date(2026, 9, 15, 19, 0); // Thursday, October 15

function day(dayKey: string, count: number): StudyFeedDay {
  return {
    dayKey,
    label: dayKey,
    dateLabel: dayKey,
    isEmpty: count === 0,
    parts: count
      ? [{ part: 'evening', label: 'Evening', items: Array.from({ length: count }, (_, i) => ({ id: `${dayKey}-${i}` }) as never) }]
      : [],
  };
}

describe('buildWeekStrip', () => {
  it('runs the last seven days oldest first, today last, with initials', () => {
    const strip = buildWeekStrip([day('2026-10-15', 8), day('2026-10-14', 0), day('2026-10-09', 2)], now, {
      hasOlder: false,
    });
    expect(strip.map((d) => d.initial).join('')).toBe('FSSMTWT');
    expect(strip.at(-1)).toMatchObject({ dayKey: '2026-10-15', count: 8, isToday: true, known: true });
    expect(strip[0]).toMatchObject({ dayKey: '2026-10-09', count: 2 });
  });

  it("marks days older than the loaded feed unknown while there's more to load", () => {
    const strip = buildWeekStrip([day('2026-10-15', 40), day('2026-10-14', 3)], now, { hasOlder: true });
    expect(strip.filter((d) => !d.known).map((d) => d.dayKey)).toEqual([
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
    ]);
    expect(weekStripNeedsOlder(strip)).toBe(true);
    // With nothing older to load, a missing day really was a rest day.
    expect(weekStripNeedsOlder(buildWeekStrip([day('2026-10-15', 1)], now, { hasOlder: false }))).toBe(false);
  });
});

describe('weekStripLine', () => {
  const strip = (counts: number[]) =>
    buildWeekStrip(
      counts.map((count, i) => day(`2026-10-${String(15 - i).padStart(2, '0')}`, count)),
      now,
      { hasOlder: false },
    );

  it('counts the days in the Word, never the days missed', () => {
    expect(weekStripLine(strip([8, 2, 0, 1, 3, 0, 1]))).toBe('Five days in the Word this week.');
    expect(weekStripLine(strip([1, 1, 1, 1, 1, 1, 1]))).toBe('Every day in the Word this week.');
    expect(weekStripLine(strip([3]))).toBe('In the Word today.');
    expect(weekStripLine(strip([0, 2]))).toBe('One day in the Word this week.');
    expect(weekStripLine(strip([0]))).toBe('Good to see you back.');
  });

  it('describes the bars for a screen reader', () => {
    expect(weekStripLabel(strip([3, 0]))).toContain('today 3');
    expect(weekStripLabel(strip([3, 0]))).toContain('Wednesday nothing');
  });
});
