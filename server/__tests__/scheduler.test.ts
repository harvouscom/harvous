/**
 * The two timers. The daily one predates reminders and must keep firing at midnight UTC;
 * the hourly one exists because a reminder is due at an hour the user chose in a timezone
 * the server does not share, so there is no single UTC hour to fire at.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../netlify-audienceful-activity-sync', () => ({ runAudiencefulActivitySync: vi.fn() }));
vi.mock('../netlify-purge-shared-spaces', () => ({ createPurgeSharedSpacesHandler: () => vi.fn() }));
vi.mock('../utils/push-reminders', () => ({ runReminderTick: vi.fn() }));

const { msUntilNextHourlyRun, msUntilNextRun } = await import('../scheduler');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('msUntilNextRun (daily)', () => {
  it('still targets midnight UTC', () => {
    const at = new Date('2026-09-06T22:00:00.000Z');
    expect(msUntilNextRun(at)).toBe(2 * HOUR);
  });

  it('rolls to tomorrow when midnight has already passed', () => {
    const at = new Date('2026-09-06T00:00:00.000Z');
    expect(msUntilNextRun(at)).toBe(24 * HOUR);
  });
});

describe('msUntilNextHourlyRun', () => {
  it('targets five past the hour', () => {
    const at = new Date('2026-09-06T13:00:00.000Z');
    expect(msUntilNextHourlyRun(at)).toBe(5 * MINUTE);
  });

  it('rolls to the next hour once five past has gone by', () => {
    const at = new Date('2026-09-06T13:05:00.000Z');
    expect(msUntilNextHourlyRun(at)).toBe(HOUR);
  });

  it('never waits more than an hour', () => {
    for (let minute = 0; minute < 60; minute += 7) {
      const at = new Date(`2026-09-06T13:${String(minute).padStart(2, '0')}:30.000Z`);
      const delay = msUntilNextHourlyRun(at);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(HOUR);
    }
  });

  it('stays clear of midnight, where the daily jobs run', () => {
    // The Audienceful sync can hold the process for minutes; five past keeps reminders from
    // queueing behind it.
    const at = new Date('2026-09-06T23:50:00.000Z');
    const next = new Date(at.getTime() + msUntilNextHourlyRun(at));
    expect(next.getUTCMinutes()).toBe(5);
    expect(next.getUTCHours()).toBe(0);
  });
});
