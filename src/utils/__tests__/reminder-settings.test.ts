import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_SETTINGS,
  formatReminderHour,
  isKindPausedByPolicy,
  isReminderEnabled,
  midweekDayLabel,
  parseReminderSettings,
  serializeReminderSettings,
  validateReminderSettingsInput,
} from '../reminder-settings';

describe('reminder-settings', () => {
  // `as const` on the day so spreads keep the MidweekDay literal type rather than widening
  // to number, which is what the validator and ReminderSettings both require.
  const valid = { sunday: true, midweek: true, midweekDay: 3 as const, hour: 8 };

  it('accepts a well-formed schedule', () => {
    expect(validateReminderSettingsInput(valid)).toEqual({ ...valid, pausedByPolicy: null });
  });

  it('rejects a midweek day outside Monday through Saturday', () => {
    // Sunday has its own switch — allowing 0 here would let both fire on the same day.
    expect(validateReminderSettingsInput({ ...valid, midweekDay: 0 })).toBeNull();
    expect(validateReminderSettingsInput({ ...valid, midweekDay: 7 })).toBeNull();
  });

  it('rejects a non-integer or out-of-range hour', () => {
    expect(validateReminderSettingsInput({ ...valid, hour: 24 })).toBeNull();
    expect(validateReminderSettingsInput({ ...valid, hour: -1 })).toBeNull();
    expect(validateReminderSettingsInput({ ...valid, hour: 8.5 })).toBeNull();
  });

  it('refuses a client-supplied pause but allows clearing one', () => {
    // A pause is a conclusion the server drew from evidence; a client claiming one would be
    // claiming evidence it does not have.
    expect(
      validateReminderSettingsInput({ ...valid, pausedByPolicy: { at: new Date().toISOString(), kind: 'all' } }),
    ).toBeNull();
    expect(validateReminderSettingsInput({ ...valid, pausedByPolicy: null })).not.toBeNull();
  });

  it('round-trips through serialize and parse', () => {
    const settings = { ...valid, midweekDay: 5 as const, hour: 6, pausedByPolicy: null };
    expect(parseReminderSettings(serializeReminderSettings(settings))).toEqual(settings);
  });

  it('reads unusable stored values as never set rather than throwing', () => {
    expect(parseReminderSettings(null)).toBeNull();
    expect(parseReminderSettings('not json')).toBeNull();
    expect(parseReminderSettings('{"sunday":true}')).toBeNull();
  });

  it('keeps a stored pause when parsing, and drops a malformed one', () => {
    const at = '2026-09-20T13:00:00.000Z';
    const withPause = JSON.stringify({ ...valid, pausedByPolicy: { at, kind: 'midweek' } });
    expect(parseReminderSettings(withPause)?.pausedByPolicy).toEqual({ at, kind: 'midweek' });

    const badKind = JSON.stringify({ ...valid, pausedByPolicy: { at, kind: 'someday' } });
    expect(parseReminderSettings(badKind)?.pausedByPolicy).toBeNull();
  });

  it('treats both switches off as disabled', () => {
    expect(isReminderEnabled({ ...valid, sunday: false, midweek: false, pausedByPolicy: null })).toBe(false);
    expect(isReminderEnabled({ ...valid, sunday: false, pausedByPolicy: null })).toBe(true);
    expect(isReminderEnabled(null)).toBe(false);
  });

  it('reports a whole-account pause as covering both kinds', () => {
    const paused = { ...valid, pausedByPolicy: { at: '2026-09-20T13:00:00.000Z', kind: 'all' as const } };
    expect(isKindPausedByPolicy(paused, 'sunday')).toBe(true);
    expect(isKindPausedByPolicy(paused, 'midweek')).toBe(true);

    const onlyMidweek = { ...paused, pausedByPolicy: { at: paused.pausedByPolicy.at, kind: 'midweek' as const } };
    expect(isKindPausedByPolicy(onlyMidweek, 'sunday')).toBe(false);
    expect(isKindPausedByPolicy(onlyMidweek, 'midweek')).toBe(true);
  });

  it('formats hours the way the settings select shows them', () => {
    expect(formatReminderHour(0)).toBe('12 AM');
    expect(formatReminderHour(8)).toBe('8 AM');
    expect(formatReminderHour(12)).toBe('12 PM');
    expect(formatReminderHour(20)).toBe('8 PM');
  });

  it('defaults to a Wednesday 8 AM pair', () => {
    expect(DEFAULT_REMINDER_SETTINGS.hour).toBe(8);
    expect(midweekDayLabel(DEFAULT_REMINDER_SETTINGS.midweekDay)).toBe('Wednesday');
  });
});
