import { describe, expect, it } from 'vitest';
import { churchClockNow } from '../church-service-times';

describe('churchClockNow', () => {
  it('reads the church wall clock, not the server or viewer one', () => {
    // 2026-08-09T15:30:00Z is 10:30 in Chicago (CDT, UTC-5) the same day.
    const at = new Date('2026-08-09T15:30:00Z');
    expect(churchClockNow('America/Chicago', at)).toEqual({ date: '2026-08-09', time: '10:30' });
    expect(churchClockNow('America/Los_Angeles', at)).toEqual({ date: '2026-08-09', time: '08:30' });
  });

  it('rolls the date back for a church west of the UTC day boundary', () => {
    // 02:30Z Monday is still Sunday evening in Chicago — the exact case that
    // makes "has the evening service started?" a church-clock question.
    const at = new Date('2026-08-10T02:30:00Z');
    expect(churchClockNow('America/Chicago', at)).toEqual({ date: '2026-08-09', time: '21:30' });
  });

  it('emits a padded 24-hour time that sorts against stored slots', () => {
    const at = new Date('2026-08-09T14:05:00Z');
    const clock = churchClockNow('America/New_York', at);
    expect(clock.time).toBe('10:05');
    expect(clock.time < '10:45').toBe(true);
  });

  it('renders midnight as 00:00, never 24:00', () => {
    // Intl's h23 can yield '24' for midnight; string-comparing that against
    // '09:00' would make an early service look already past.
    const at = new Date('2026-08-09T05:00:00Z');
    expect(churchClockNow('America/Chicago', at).time).toBe('00:00');
  });

  it('falls back to UTC for a church with no zone set', () => {
    const at = new Date('2026-08-09T15:30:00Z');
    expect(churchClockNow(null, at)).toEqual({ date: '2026-08-09', time: '15:30' });
    expect(churchClockNow('Mars/Olympus', at)).toEqual({ date: '2026-08-09', time: '15:30' });
  });
});
