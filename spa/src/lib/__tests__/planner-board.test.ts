import { describe, it, expect } from 'vitest';
import {
  BACKLOG_DROPPABLE_ID,
  buildPlannerWeeks,
  dayDroppableId,
  parseDroppableId,
  partitionPlan,
  resolveDropDate,
  sermonsInWeek,
  weekDroppableId,
  type PlannerSermonLike,
} from '../planner-board';

/** 2026-08-06 is a Thursday; 2026-08-09 the Sunday after. */
const TODAY = '2026-08-06';

function sermon(overrides: Partial<PlannerSermonLike> & { id: string }): PlannerSermonLike {
  return { serviceDate: null, createdAt: null, ...overrides };
}

describe('buildPlannerWeeks', () => {
  it("starts on the week containing today, anchored to the church's service day", () => {
    const weeks = buildPlannerWeeks(0, TODAY, 3);
    // Sunday anchor: Thursday the 6th belongs to the week that began Sunday the 2nd.
    expect(weeks.map((w) => w.startIso)).toEqual(['2026-08-02', '2026-08-09', '2026-08-16']);
    expect(weeks[0].endIso).toBe('2026-08-08');
    expect(weeks[0].isCurrent).toBe(true);
    expect(weeks[1].isCurrent).toBe(false);
  });

  it('anchors to a midweek gathering without splitting it across columns', () => {
    // Wednesday anchor: Thursday the 6th is the day after Wednesday the 5th.
    const weeks = buildPlannerWeeks(3, TODAY, 2);
    expect(weeks.map((w) => w.startIso)).toEqual(['2026-08-05', '2026-08-12']);
  });

  it('keeps today in the first column when today is the anchor day', () => {
    const weeks = buildPlannerWeeks(4, TODAY, 1);
    expect(weeks[0].startIso).toBe(TODAY);
  });

  it('labels a week that straddles a month with both months', () => {
    const weeks = buildPlannerWeeks(0, '2026-08-30', 1);
    expect(weeks[0].label).toContain('Aug 30');
    expect(weeks[0].label).toContain('Sep');
  });

  it('returns nothing for a non-positive count or an unparseable day', () => {
    expect(buildPlannerWeeks(0, TODAY, 0)).toEqual([]);
    expect(buildPlannerWeeks(0, 'not-a-date', 4)).toEqual([]);
  });
});

describe('resolveDropDate', () => {
  const weeks = buildPlannerWeeks(0, TODAY, 4);

  it('keeps a scheduled sermon on its own weekday, moving only the week', () => {
    // A Wednesday sermon dropped two weeks out stays a Wednesday. It matters
    // beyond tidiness: the server carries its service-slot claims to the new
    // date, and Wednesday slots on a Sunday is a plan nobody can honour.
    const wednesday = sermon({ id: 'svc_1', serviceDate: '2026-08-05' });
    expect(resolveDropDate(wednesday, weeks[2], 0)).toBe('2026-08-19');
  });

  it("lands an undated idea on the plan's own service day", () => {
    const idea = sermon({ id: 'svc_2' });
    expect(resolveDropDate(idea, weeks[1], 0)).toBe('2026-08-09');
  });

  it('lands an undated idea on a midweek plan’s meeting day', () => {
    const midweekWeeks = buildPlannerWeeks(3, TODAY, 2);
    const idea = sermon({ id: 'svc_3' });
    expect(resolveDropDate(idea, midweekWeeks[1], 3)).toBe('2026-08-12');
  });

  it("falls back to the column's own start when no service day is set", () => {
    const idea = sermon({ id: 'svc_4' });
    expect(resolveDropDate(idea, weeks[1], null)).toBe(weeks[1].startIso);
  });

  it('always lands inside the week that was dropped on', () => {
    const saturday = sermon({ id: 'svc_5', serviceDate: '2026-08-08' });
    const landed = resolveDropDate(saturday, weeks[3], 0);
    expect(landed >= weeks[3].startIso).toBe(true);
    expect(landed <= weeks[3].endIso).toBe(true);
  });
});

describe('partitionPlan', () => {
  it('separates undated ideas from dated sermons', () => {
    const { backlog, byDate } = partitionPlan([
      sermon({ id: 'a', serviceDate: '2026-08-09' }),
      sermon({ id: 'b' }),
      sermon({ id: 'c', serviceDate: '2026-08-09' }),
    ]);
    expect(backlog.map((s) => s.id)).toEqual(['b']);
    expect(byDate.get('2026-08-09')?.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('orders the backlog newest first', () => {
    const { backlog } = partitionPlan([
      sermon({ id: 'older', createdAt: '2026-07-01T00:00:00.000Z' }),
      sermon({ id: 'newer', createdAt: '2026-08-01T00:00:00.000Z' }),
    ]);
    expect(backlog.map((s) => s.id)).toEqual(['newer', 'older']);
  });
});

describe('sermonsInWeek', () => {
  it('collects every dated sermon inside the column, earliest first', () => {
    const weeks = buildPlannerWeeks(0, TODAY, 2);
    const { byDate } = partitionPlan([
      sermon({ id: 'sun', serviceDate: '2026-08-09' }),
      sermon({ id: 'wed', serviceDate: '2026-08-12' }),
      sermon({ id: 'next', serviceDate: '2026-08-16' }),
    ]);
    expect(sermonsInWeek(byDate, weeks[1]).map((s) => s.id)).toEqual(['sun', 'wed']);
  });
});

describe('parseDroppableId', () => {
  it('round-trips each droppable kind', () => {
    expect(parseDroppableId(BACKLOG_DROPPABLE_ID)).toEqual({ kind: 'backlog' });
    expect(parseDroppableId(weekDroppableId('2026-08-09'))).toEqual({
      kind: 'week',
      startIso: '2026-08-09',
    });
    expect(parseDroppableId(dayDroppableId('2026-08-09'))).toEqual({
      kind: 'day',
      iso: '2026-08-09',
    });
  });

  it('returns null for a card id, so a card-on-card drop is not a move', () => {
    expect(parseDroppableId('svc_abc')).toBeNull();
  });
});
