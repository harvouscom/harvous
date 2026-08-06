/**
 * Pure helpers for ProtoTimePicker.
 *
 * A church's service times are wall-clock readings — 'HH:MM', 24-hour, no zone
 * (the zone is `Churches.timezone`, recorded once). Everything here works on
 * that string so nothing has to round-trip through a Date and pick up today's
 * date, a timezone, or a DST edge on the way.
 *
 * Split from the component so the arithmetic is testable without rendering.
 */

/**
 * Minutes offered, in five-minute steps.
 *
 * Quarters would cover 9:00 and 10:45 but not a church that meets at 10:40, and
 * in a menu the extra eight rows cost nothing — the constraint only mattered
 * when every option had to be a visible button.
 */
export const TIME_PICKER_MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;

/**
 * Hours offered, in 12-hour display order starting at 12.
 *
 * Deliberately all twelve rather than a curated 6–9 range: the moment it
 * excludes a real church's time it is worse than useless.
 */
export const TIME_PICKER_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export type Meridiem = 'AM' | 'PM';

export type TimeParts = {
  /** 1–12, as displayed. */
  hour12: number;
  minute: number;
  meridiem: Meridiem;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 'HH:MM' → display parts, or null when it isn't a valid 24-hour time. */
export function parseTimeValue(value: string | null | undefined): TimeParts | null {
  const match = TIME_PATTERN.exec(String(value ?? '').trim());
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  return {
    // 0 and 12 both display as 12 — midnight is 12 AM, noon is 12 PM.
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    meridiem: hour24 < 12 ? 'AM' : 'PM',
  };
}

/** Display parts → 'HH:MM', zero-padded. The inverse of `parseTimeValue`. */
export function buildTimeValue(parts: TimeParts): string {
  const base = parts.hour12 % 12; // 12 AM → 0, 12 PM → 12 via the offset below
  const hour24 = parts.meridiem === 'PM' ? base + 12 : base;
  return `${String(hour24).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/**
 * The parts a picker should show for a value, falling back to a sane start.
 *
 * Never returns null: an empty field still has to render *something* selected,
 * and 9:00 AM is the most common first service time — so opening the picker
 * already shows a plausible answer rather than an empty grid.
 */
export function timePartsOrDefault(value: string | null | undefined): TimeParts {
  return parseTimeValue(value) ?? { hour12: 9, minute: 0, meridiem: 'AM' };
}

/** What an untouched "add a service" form starts on. */
export const DEFAULT_SERVICE_TIME = '09:00';
