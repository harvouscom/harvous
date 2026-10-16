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
  it('runs this week Sunday to Saturday, with the days ahead marked', () => {
    const strip = buildWeekStrip([day('2026-10-15', 8), day('2026-10-14', 0), day('2026-10-12', 2)], now, {
      hasOlder: false,
    });
    expect(strip.map((d) => d.initial).join('')).toBe('SMTWTFS');
    expect(strip[4]).toMatchObject({ dayKey: '2026-10-15', count: 8, isToday: true, future: false });
    expect(strip[1]).toMatchObject({ dayKey: '2026-10-12', count: 2 });
    expect(strip.filter((d) => d.future).map((d) => d.dayKey)).toEqual(['2026-10-16', '2026-10-17']);
  });

  it("marks days older than the loaded feed unknown while there's more to load", () => {
    const strip = buildWeekStrip([day('2026-10-15', 40), day('2026-10-14', 3)], now, { hasOlder: true });
    expect(strip.filter((d) => !d.known).map((d) => d.dayKey)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
    expect(weekStripNeedsOlder(strip)).toBe(true);
    // With nothing older to load, a missing day really was a rest day.
    expect(weekStripNeedsOlder(buildWeekStrip([day('2026-10-15', 1)], now, { hasOlder: false }))).toBe(false);
  });
});

describe('weekStripLine', () => {
  /** Counts from today backwards, the way the feed lists days. */
  const strip = (counts: number[], at = now) =>
    buildWeekStrip(
      counts.map((count, i) => {
        const d = new Date(at.getFullYear(), at.getMonth(), at.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return day(key, count);
      }),
      at,
      { hasOlder: false },
    );

  it('names the days the bars show', () => {
    expect(weekStripLine(strip([8]))).toBe('Here today, the first time this week.');
    expect(weekStripLine(strip([3, 0, 2]))).toBe('Here Tuesday and today.');
    expect(weekStripLine(strip([3, 0, 2, 1]))).toBe('Here Monday, Tuesday and today.');
    expect(weekStripLine(strip([0, 2]))).toBe('Here Wednesday this week.');
  });

  it('counts past three, and never counts the days missed', () => {
    expect(weekStripLine(strip([1, 1, 0, 1, 1]))).toBe('Four days in the Word this week.');
    expect(weekStripLine(strip([1, 1, 1, 1, 1]))).toBe('Every day so far this week.');
    expect(weekStripLine(strip([0]))).toBe('Good to see you back.');
  });

  it('on a Sunday, today is the whole week so far', () => {
    expect(weekStripLine(strip([2], new Date(2026, 9, 11, 9)))).toBe('In the Word today.');
  });

  it('describes the bars for a screen reader, leaving out the days ahead', () => {
    const label = weekStripLabel(strip([3, 0]));
    expect(label).toContain('today 3');
    expect(label).toContain('Wednesday nothing');
    expect(label).not.toContain('Friday');
  });
});
