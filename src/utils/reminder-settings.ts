/**
 * The reminder schedule, and the rules for reading it back.
 *
 * Shared by the SPA and the server on purpose, like `onboarding-state.ts`: the settings
 * page validates what it is about to send, the endpoint validates what it received, and the
 * hourly tick reads the stored column. One shape, one parser, no drift.
 *
 * Deliberately small, and shaped as a *rhythm* rather than a count. The reader picks one
 * cadence — twice a week, or the day's passage every day — and the response layer
 * (`server/utils/reminder-policy.ts`) can only ever lower it from there, never raise it.
 * A free-form "how many" would be an invitation to send more.
 *
 * The two cadences are exclusive on purpose. As independent switches, "every day" and
 * "Sunday" both claim a Sunday, and the tick would have had to dedupe them at send time —
 * a rule that exists only because the settings let someone ask for something incoherent.
 * One picker makes the double impossible rather than handled.
 */

/**
 * Tuesday, Wednesday or Thursday — the days that are actually midweek.
 *
 * Narrower than "any day that isn't Sunday" on purpose. Monday and Saturday sit against the
 * weekend and read as the start or end of one, not the middle; Friday belongs to the weekend
 * for most people. Offering six choices invited the reader to pick a day the label contradicts.
 */
export type MidweekDay = 2 | 3 | 4;

/**
 * How often reminders come.
 *
 * `twice-weekly` reads `sunday` / `midweek` / `midweekDay` below; `daily` ignores all three
 * and sends every day at `hour`. They are kept rather than cleared when switching to daily,
 * so going back restores the days someone already chose.
 */
export type ReminderCadence = 'twice-weekly' | 'daily';

export const REMINDER_CADENCES: readonly ReminderCadence[] = ['twice-weekly', 'daily'];

export function reminderCadenceLabel(cadence: ReminderCadence): string {
  return cadence === 'daily' ? 'Every day' : 'Sunday and midweek';
}

export interface ReminderSettings {
  cadence: ReminderCadence;
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
    kind: 'sunday' | 'midweek' | 'daily' | 'all';
  } | null;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  cadence: 'twice-weekly',
  sunday: true,
  midweek: true,
  midweekDay: 3,
  hour: 8,
  pausedByPolicy: null,
};

/** The hours the settings page offers. Earlier than five or later than eight is not a morning nudge. */
export const REMINDER_HOUR_MIN = 5;
export const REMINDER_HOUR_MAX = 20;

/** In order, and the single source for both the label and the picker's options. */
export const MIDWEEK_DAYS: readonly MidweekDay[] = [2, 3, 4];

const MIDWEEK_DAY_LABELS: Record<MidweekDay, string> = {
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
};

export function midweekDayLabel(day: MidweekDay): string {
  return MIDWEEK_DAY_LABELS[day];
}

function isMidweekDay(value: unknown): value is MidweekDay {
  return value === 2 || value === 3 || value === 4;
}

/**
 * Read a cadence, defaulting to the rhythm every stored account already has.
 *
 * Accounts saved before this field existed have no `cadence` at all, and they were all on
 * the twice-weekly rhythm by definition. Treating a missing value as `twice-weekly` is what
 * lets those rows keep working untouched rather than needing a migration — and it is the
 * safe direction to be wrong in, since the alternative would silently start sending someone
 * seven reminders a week they never asked for.
 */
function readCadence(value: unknown): ReminderCadence {
  return value === 'daily' ? 'daily' : 'twice-weekly';
}

function isHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;
}

function parsePaused(raw: unknown): ReminderSettings['pausedByPolicy'] {
  if (!raw || typeof raw !== 'object') return null;
  const { at, kind } = raw as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (kind !== 'sunday' && kind !== 'midweek' && kind !== 'daily' && kind !== 'all') return null;
  return { at, kind };
}

/**
 * Validate a client body. Every field is required except the pause marker, which the client
 * may only ever *clear* (send `null`) — setting it is the policy's job.
 */
export function validateReminderSettingsInput(body: unknown): ReminderSettings | null {
  if (!body || typeof body !== 'object') return null;
  const { cadence, sunday, midweek, midweekDay, hour, pausedByPolicy } = body as Record<string, unknown>;
  if (typeof sunday !== 'boolean' || typeof midweek !== 'boolean') return null;
  if (!isMidweekDay(midweekDay) || !isHour(hour)) return null;
  if (pausedByPolicy !== undefined && pausedByPolicy !== null) return null;
  // Anything unrecognised falls to twice-weekly rather than being rejected: an older client
  // that does not know about cadence still sends a valid schedule.
  return { cadence: readCadence(cadence), sunday, midweek, midweekDay, hour, pausedByPolicy: null };
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
  const { cadence, sunday, midweek, midweekDay, hour, pausedByPolicy } = parsed as Record<string, unknown>;
  if (typeof sunday !== 'boolean' || typeof midweek !== 'boolean') return null;
  if (!isMidweekDay(midweekDay) || !isHour(hour)) return null;
  return {
    cadence: readCadence(cadence),
    sunday,
    midweek,
    midweekDay,
    hour,
    pausedByPolicy: parsePaused(pausedByPolicy),
  };
}

export function serializeReminderSettings(settings: ReminderSettings): string {
  return JSON.stringify({
    cadence: settings.cadence,
    sunday: settings.sunday,
    midweek: settings.midweek,
    midweekDay: settings.midweekDay,
    hour: settings.hour,
    pausedByPolicy: settings.pausedByPolicy ?? null,
  });
}

/**
 * Whether reminders are wanted at all. The policy pause is separate: a paused rhythm is still
 * "enabled" in intent.
 *
 * Daily needs no switch of its own — choosing that rhythm *is* the switch. Only the
 * twice-weekly rhythm can be on with neither of its days selected, which means off.
 */
export function isReminderEnabled(settings: ReminderSettings | null | undefined): boolean {
  if (!settings) return false;
  if (settings.cadence === 'daily') return true;
  return settings.sunday || settings.midweek;
}

/** Whether the policy has this kind on hold right now. */
export function isKindPausedByPolicy(
  settings: ReminderSettings,
  kind: 'sunday' | 'midweek' | 'daily',
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
