import { describe, expect, it } from 'vitest';
import {
  buildTimeValue,
  parseTimeValue,
  timePartsOrDefault,
  DEFAULT_SERVICE_TIME,
  TIME_PICKER_HOURS,
  TIME_PICKER_MINUTES,
} from '../proto-time-picker';

describe('parseTimeValue', () => {
  it('reads a morning and an afternoon time', () => {
    expect(parseTimeValue('09:00')).toEqual({ hour12: 9, minute: 0, meridiem: 'AM' });
    expect(parseTimeValue('18:30')).toEqual({ hour12: 6, minute: 30, meridiem: 'PM' });
  });

  it('displays midnight and noon both as 12', () => {
    // The pair that a naive `hour % 12` gets wrong: 00:00 would read "0 AM".
    expect(parseTimeValue('00:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'AM' });
    expect(parseTimeValue('12:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'PM' });
    expect(parseTimeValue('12:45')).toEqual({ hour12: 12, minute: 45, meridiem: 'PM' });
  });

  it('rejects anything that is not a 24-hour clock reading', () => {
    for (const bad of ['', '  ', '9:00', '24:00', '23:60', '10:5', 'noon', null, undefined]) {
      expect(parseTimeValue(bad), String(bad)).toBeNull();
    }
  });
});

describe('buildTimeValue', () => {
  it('zero-pads and converts back to 24 hours', () => {
    expect(buildTimeValue({ hour12: 9, minute: 0, meridiem: 'AM' })).toBe('09:00');
    expect(buildTimeValue({ hour12: 6, minute: 30, meridiem: 'PM' })).toBe('18:30');
  });

  it('handles both 12 oclock hours in both directions', () => {
    expect(buildTimeValue({ hour12: 12, minute: 0, meridiem: 'AM' })).toBe('00:00');
    expect(buildTimeValue({ hour12: 12, minute: 0, meridiem: 'PM' })).toBe('12:00');
  });

  it('round-trips every hour and minute the picker offers', () => {
    // The real guard: any hour/minute/meridiem the UI can produce must survive
    // a trip through the value format and come back identical. Driven off the
    // exported options so widening either list cannot outrun this test.
    for (const meridiem of ['AM', 'PM'] as const) {
      for (const hour12 of TIME_PICKER_HOURS) {
        for (const minute of TIME_PICKER_MINUTES) {
          const value = buildTimeValue({ hour12, minute, meridiem });
          expect(parseTimeValue(value), value).toEqual({ hour12, minute, meridiem });
        }
      }
    }
  });
});

describe('timePartsOrDefault', () => {
  it('falls back to 9:00 AM so the picker never opens empty', () => {
    expect(timePartsOrDefault('')).toEqual({ hour12: 9, minute: 0, meridiem: 'AM' });
    expect(timePartsOrDefault('garbage')).toEqual({ hour12: 9, minute: 0, meridiem: 'AM' });
  });

  it('prefers a real value over the fallback', () => {
    expect(timePartsOrDefault('18:45')).toEqual({ hour12: 6, minute: 45, meridiem: 'PM' });
  });

  it('agrees with the form default', () => {
    expect(buildTimeValue(timePartsOrDefault(''))).toBe(DEFAULT_SERVICE_TIME);
  });
});
