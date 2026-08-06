import { describe, expect, it } from 'vitest';
import {
  normalizeChurchTimezone,
  normalizeServiceDay,
  normalizeServiceTime,
} from '../church-service-time';

describe('normalizeServiceTime', () => {
  it('accepts a padded 24-hour time', () => {
    expect(normalizeServiceTime('10:30')).toEqual({ ok: true, value: '10:30' });
    expect(normalizeServiceTime('00:00')).toEqual({ ok: true, value: '00:00' });
    expect(normalizeServiceTime('23:59')).toEqual({ ok: true, value: '23:59' });
    expect(normalizeServiceTime(' 09:15 ')).toEqual({ ok: true, value: '09:15' });
  });

  it('treats blank as inherit rather than as an error', () => {
    // NULL on this column means "use the church default", which is what an
    // emptied <input type="time"> should produce — not a validation failure.
    for (const blank of ['', '   ', null, undefined]) {
      expect(normalizeServiceTime(blank)).toEqual({ ok: true, value: null });
    }
  });

  it('rejects an unpadded hour', () => {
    // The column sorts as text, so '9:30' would order after '10:30'.
    expect(normalizeServiceTime('9:30').ok).toBe(false);
  });

  it('rejects out-of-range and malformed times', () => {
    for (const bad of ['24:00', '10:60', '10:3', '10:30:00', '1030', 'noon', '10-30']) {
      expect(normalizeServiceTime(bad).ok, `${bad} should be rejected`).toBe(false);
    }
  });

  it('rejects non-strings', () => {
    expect(normalizeServiceTime(1030).ok).toBe(false);
    expect(normalizeServiceTime({ hour: 10 }).ok).toBe(false);
  });
});

describe('normalizeServiceDay', () => {
  it('accepts every weekday index', () => {
    for (let day = 0; day <= 6; day++) {
      expect(normalizeServiceDay(day)).toEqual({ ok: true, value: day });
    }
  });

  it('treats blank as unset', () => {
    expect(normalizeServiceDay(null)).toEqual({ ok: true, value: null });
    expect(normalizeServiceDay(undefined)).toEqual({ ok: true, value: null });
    expect(normalizeServiceDay('')).toEqual({ ok: true, value: null });
  });

  it('rejects out-of-range, fractional, and string days', () => {
    // A string '0' is the shape a <select> yields — the route must parse before
    // it validates, so accepting it here would hide a real bug.
    for (const bad of [-1, 7, 0.5, '0', '3', NaN]) {
      expect(normalizeServiceDay(bad).ok, `${String(bad)} should be rejected`).toBe(false);
    }
  });
});

describe('normalizeChurchTimezone', () => {
  it('accepts real IANA zones', () => {
    expect(normalizeChurchTimezone('America/Chicago')).toEqual({
      ok: true,
      value: 'America/Chicago',
    });
    expect(normalizeChurchTimezone('Pacific/Honolulu').ok).toBe(true);
  });

  it('treats blank as unset', () => {
    expect(normalizeChurchTimezone('')).toEqual({ ok: true, value: null });
    expect(normalizeChurchTimezone(null)).toEqual({ ok: true, value: null });
  });

  it('rejects invented zones and injection-shaped input', () => {
    for (const bad of ['Mars/Olympus', "America/Chicago'; DROP TABLE Churches;--", 'Chicago']) {
      expect(normalizeChurchTimezone(bad).ok, `${bad} should be rejected`).toBe(false);
    }
  });
});
