/**
 * The two pure pieces of the hourly tick: reading a wall clock in someone else's zone, and
 * deciding whether this is their moment.
 *
 * Everything else in `push-reminders.ts` talks to the database; these are the parts where a
 * bug would silently send at the wrong hour, on the wrong day, or twice.
 */
import { describe, expect, it, vi } from 'vitest';

// The module pulls in the db barrel at import time, which would open a pool under vitest.
vi.mock('../../db', () => ({
  and: vi.fn(),
  db: {},
  eq: vi.fn(),
  gt: vi.fn(),
  gte: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
  NoteVisitEvents: {},
  PushSubscriptions: {},
  ReadingEvents: {},
  ReminderDeliveries: {},
  UserMetadata: {},
}));
vi.mock('../web-push-client', () => ({ isPushConfigured: () => false, sendToUser: vi.fn() }));
vi.mock('../reminder-payload', () => ({ buildReminderPayload: vi.fn() }));

const { dueKindFor, localPartsFor } = await import('../push-reminders');

const settings = {
  sunday: true,
  midweek: true,
  midweekDay: 3 as const,
  hour: 8,
  pausedByPolicy: null,
};

describe('localPartsFor', () => {
  it('reads the wall clock in the given zone, not the server one', () => {
    // 13:00 UTC is 8 AM in Chicago (CDT) and 10 PM in Tokyo, on two different dates.
    const at = new Date('2026-09-06T13:00:00.000Z');
    expect(localPartsFor('America/Chicago', at)).toEqual({
      hour: 8,
      weekday: 0,
      localDate: '2026-09-06',
    });
    expect(localPartsFor('Asia/Tokyo', at)).toEqual({
      hour: 22,
      weekday: 0,
      localDate: '2026-09-06',
    });
  });

  it('crosses the date line without splitting the day from the hour', () => {
    // Kiritimati is UTC+14: still Saturday evening in UTC, already Sunday morning there.
    const at = new Date('2026-09-05T18:00:00.000Z');
    expect(localPartsFor('Pacific/Kiritimati', at)).toEqual({
      hour: 8,
      weekday: 0,
      localDate: '2026-09-06',
    });
  });

  it('reports midnight as hour 0, not 24', () => {
    expect(localPartsFor('UTC', new Date('2026-09-06T00:30:00.000Z')).hour).toBe(0);
  });

  it('follows a daylight-saving shift rather than a fixed offset', () => {
    // The same UTC instant is 8 AM in March (CDT) and 7 AM in December (CST).
    expect(localPartsFor('America/Chicago', new Date('2026-03-15T13:00:00.000Z')).hour).toBe(8);
    expect(localPartsFor('America/Chicago', new Date('2026-12-15T13:00:00.000Z')).hour).toBe(7);
  });

  it('falls back to UTC on a zone it cannot read', () => {
    expect(localPartsFor('Not/AZone', new Date('2026-09-06T13:00:00.000Z')).hour).toBe(13);
  });
});

describe('dueKindFor', () => {
  const sundayAt = (hour: number) => ({ hour, weekday: 0, localDate: '2026-09-06' });
  const wednesdayAt = (hour: number) => ({ hour, weekday: 3, localDate: '2026-09-09' });

  it('fires on Sunday at the chosen hour', () => {
    expect(dueKindFor(settings, sundayAt(8))).toBe('sunday');
  });

  it('fires midweek on the chosen day', () => {
    expect(dueKindFor(settings, wednesdayAt(8))).toBe('midweek');
  });

  it('says nothing at any other hour', () => {
    expect(dueKindFor(settings, sundayAt(7))).toBeNull();
    expect(dueKindFor(settings, sundayAt(10))).toBeNull();
  });

  it('still fires an hour late, so a deploy during the tick costs nobody their reminder', () => {
    expect(dueKindFor(settings, sundayAt(9))).toBe('sunday');
  });

  it('wraps the late window across midnight', () => {
    const lateNight = { ...settings, hour: 23 };
    expect(dueKindFor(lateNight, { hour: 0, weekday: 0, localDate: '2026-09-06' })).toBe('sunday');
  });

  it('says nothing on a day neither switch claims', () => {
    expect(dueKindFor(settings, { hour: 8, weekday: 5, localDate: '2026-09-11' })).toBeNull();
  });

  it('respects each switch independently', () => {
    expect(dueKindFor({ ...settings, sunday: false }, sundayAt(8))).toBeNull();
    expect(dueKindFor({ ...settings, midweek: false }, wednesdayAt(8))).toBeNull();
  });

  it('cannot produce two kinds on one day, because midweek is only Tue-Thu', () => {
    // The type allows 2..4 only, so no midweek day can collide with Sunday. This asserts the
    // consequence rather than the type.
    for (const day of [2, 3, 4] as const) {
      const parts = { hour: 8, weekday: 0, localDate: '2026-09-06' };
      expect(dueKindFor({ ...settings, midweekDay: day }, parts)).toBe('sunday');
    }
  });

  it('never fires midweek on a Monday, Friday or Saturday', () => {
    for (const weekday of [1, 5, 6]) {
      expect(dueKindFor(settings, { hour: 8, weekday, localDate: '2026-09-07' })).toBeNull();
    }
  });
});
