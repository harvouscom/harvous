/**
 * Validation for a church's meeting defaults and a service's own time.
 *
 * Pure — no DB, no network. Route handlers own the HTTP shape; this returns a
 * result the caller turns into a 400. Same contract as church-service-passage.ts.
 *
 * Deliberately NOT named `church-schedule-*`: "scheduling" is a named anti-goal
 * (MY_CHURCH_SIDEBAR.md, CHMS_INTEGRATION_RESEARCH.md), and a filename is a
 * durable claim about what a product does. These values pre-fill a date picker
 * and label a card. Nothing here schedules anything.
 */
import { isValidIanaTimeZone } from './votd-local-date';

/** 'HH:MM', 24-hour, zero-padded — the shape `<input type="time">` emits. */
export const SERVICE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ServiceTimeResult = { ok: true; value: string | null } | { ok: false; reason: string };
export type ServiceDayResult = { ok: true; value: number | null } | { ok: false; reason: string };

/** Empty, null, and undefined all mean "unset" / "inherit" — never an error. */
function isBlank(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');
}

/**
 * A time on the church's wall clock, or null to inherit.
 *
 * Rejects '9:30' on purpose: the column sorts and compares as text, so an
 * unpadded hour would order after '10:30'. The one control that writes this
 * emits padded values already.
 */
export function normalizeServiceTime(raw: unknown): ServiceTimeResult {
  if (isBlank(raw)) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, reason: 'Time must be text like 10:30' };
  const trimmed = raw.trim();
  if (!SERVICE_TIME_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'Time must be HH:MM on a 24-hour clock, like 09:30 or 18:00' };
  }
  return { ok: true, value: trimmed };
}

/** 0–6, 0 = Sunday — Date.getDay() and the WEEKDAYS array in church-services.ts. */
export function normalizeServiceDay(raw: unknown): ServiceDayResult {
  if (isBlank(raw)) return { ok: true, value: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 6) {
    return { ok: false, reason: 'Day must be a whole number from 0 (Sunday) to 6 (Saturday)' };
  }
  return { ok: true, value: raw };
}

/**
 * An IANA zone name, or null to unset.
 *
 * Delegates to `isValidIanaTimeZone` — the codebase's one IANA probe. Do not
 * write a second; two validators disagreeing about what a zone is would be a
 * silent data problem.
 */
export function normalizeChurchTimezone(raw: unknown): ServiceTimeResult {
  if (isBlank(raw)) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, reason: 'Time zone must be text' };
  const trimmed = raw.trim();
  if (!isValidIanaTimeZone(trimmed)) {
    return { ok: false, reason: 'That is not a recognised time zone' };
  }
  return { ok: true, value: trimmed };
}
