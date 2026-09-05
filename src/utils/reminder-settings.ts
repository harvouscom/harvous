/**
 * The reminder schedule, and the rules for reading it back.
 *
 * Shared by the SPA and the server on purpose, like `onboarding-state.ts`: the settings
 * page validates what it is about to send, the endpoint validates what it received, and the
 * hourly tick reads the stored column. One shape, one parser, no drift.
 *
 * Deliberately small. Two nudges a week is the ceiling — a Sunday morning and one weekday —
 * and the response layer (`server/utils/reminder-policy.ts`) can only ever lower that, never
 * raise it. A field for "how many" would be an invitation to send more.
 */

/** 1 = Monday … 6 = Saturday. Sunday is its own switch, so it can never be the midweek day. */
export type MidweekDay = 1 | 2 | 3 | 4 | 5 | 6;

export interface ReminderSettings {
  sunday: boolean;
  midweek: boolean;
  midweekDay: MidweekDay;
  /** Local hour, 0–23, in the account's stored timezone. */
  hour: number;
  /**
   * Set by the policy when a kind has gone ignored long enough to stop, so Settings can say
   * why and offer the switch back. Cleared by the user's next edit or by re-arming.
   */
  pausedByPolicy?: {
    at: string;
    kind: 'sunday' | 'midweek' | 'all';
  } | null;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  sunday: true,
  midweek: true,
  midweekDay: 3,
  hour: 8,
  pausedByPolicy: null,
};

/** The hours the settings page offers. Earlier than five or later than eight is not a morning nudge. */
export const REMINDER_HOUR_MIN = 5;
export const REMINDER_HOUR_MAX = 20;

const MIDWEEK_DAY_LABELS: Record<MidweekDay, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export function midweekDayLabel(day: MidweekDay): string {
  return MIDWEEK_DAY_LABELS[day];
}

function isMidweekDay(value: unknown): value is MidweekDay {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

function isHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;
}

function parsePaused(raw: unknown): ReminderSettings['pausedByPolicy'] {
  if (!raw || typeof raw !== 'object') return null;
  const { at, kind } = raw as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (kind !== 'sunday' && kind !== 'midweek' && kind !== 'all') return null;
  return { at, kind };
}

/**
 * Validate a client body. Every field is required except the pause marker, which the client
 * may only ever *clear* (send `null`) — setting it is the policy's job.
 */
export function validateReminderSettingsInput(body: unknown): ReminderSettings | null {
  if (!body || typeof body !== 'object') return null;
  const { sunday, midweek, midweekDay, hour, pausedByPolicy } = body as Record<string, unknown>;
  if (typeof sunday !== 'boolean' || typeof midweek !== 'boolean') return null;
  if (!isMidweekDay(midweekDay) || !isHour(hour)) return null;
  if (pausedByPolicy !== undefined && pausedByPolicy !== null) return null;
  return { sunday, midweek, midweekDay, hour, pausedByPolicy: null };
}

/**
 * Read the stored column back. Tolerant: an unreadable value is "never set", which the tick
 * treats as off, rather than an error on every profile load.
 */
export function parseReminderSettings(raw: string | null | undefined): ReminderSettings | null {
  if (!raw || typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { sunday, midweek, midweekDay, hour, pausedByPolicy } = parsed as Record<string, unknown>;
  if (typeof sunday !== 'boolean' || typeof midweek !== 'boolean') return null;
  if (!isMidweekDay(midweekDay) || !isHour(hour)) return null;
  return { sunday, midweek, midweekDay, hour, pausedByPolicy: parsePaused(pausedByPolicy) };
}

export function serializeReminderSettings(settings: ReminderSettings): string {
  return JSON.stringify({
    sunday: settings.sunday,
    midweek: settings.midweek,
    midweekDay: settings.midweekDay,
    hour: settings.hour,
    pausedByPolicy: settings.pausedByPolicy ?? null,
  });
}

/** Either switch on. The policy pause is separate: a paused kind is still "enabled" in intent. */
export function isReminderEnabled(settings: ReminderSettings | null | undefined): boolean {
  return !!settings && (settings.sunday || settings.midweek);
}

/** Whether the policy has this kind on hold right now. */
export function isKindPausedByPolicy(
  settings: ReminderSettings,
  kind: 'sunday' | 'midweek',
): boolean {
  const paused = settings.pausedByPolicy;
  if (!paused) return false;
  return paused.kind === 'all' || paused.kind === kind;
}

/** "8 AM", "12 PM", "5 PM" — for the settings select and the reminder line. */
export function formatReminderHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}
