/**
 * Ministry channel publish cadence — staff-declared intent (Apple Podcasts–style)
 * plus observed-staleness helpers for a soft follower disclaimer.
 */

export const PUBLISH_CADENCE_VALUES = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'irregular',
] as const;

export type PublishCadence = (typeof PUBLISH_CADENCE_VALUES)[number];

const INTERVAL_DAYS: Record<Exclude<PublishCadence, 'irregular'>, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
};

const LABELS: Record<PublishCadence, string> = {
  daily: 'Updates daily',
  weekly: 'Updates weekly',
  biweekly: 'Updates every 2 weeks',
  monthly: 'Updates monthly',
  quarterly: 'Updates quarterly',
  irregular: 'No set schedule',
};

/** Shorter hub/list labels (omit leading “Updates”). */
const SHORT_LABELS: Record<PublishCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  irregular: 'No set schedule',
};

export function parsePublishCadence(raw: unknown): PublishCadence | null {
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value) return null;
  return (PUBLISH_CADENCE_VALUES as readonly string[]).includes(value)
    ? (value as PublishCadence)
    : null;
}

export type PublishCadenceInputResult =
  | { kind: 'omit' }
  | { kind: 'set'; value: PublishCadence | null }
  | { kind: 'invalid' };

/** Form/JSON input: missing → omit; empty/`none` → clear; unknown → invalid. */
export function parsePublishCadenceInput(raw: unknown): PublishCadenceInputResult {
  if (raw == null) return { kind: 'omit' };
  const value = String(raw).trim().toLowerCase();
  if (!value || value === 'null' || value === 'none' || value === 'not-set') {
    return { kind: 'set', value: null };
  }
  if ((PUBLISH_CADENCE_VALUES as readonly string[]).includes(value)) {
    return { kind: 'set', value: value as PublishCadence };
  }
  return { kind: 'invalid' };
}

export function isTimedPublishCadence(
  cadence: PublishCadence | null | undefined,
): cadence is Exclude<PublishCadence, 'irregular'> {
  return cadence != null && cadence !== 'irregular' && cadence in INTERVAL_DAYS;
}

export function cadenceIntervalDays(cadence: PublishCadence | null | undefined): number | null {
  if (!isTimedPublishCadence(cadence)) return null;
  return INTERVAL_DAYS[cadence];
}

export function cadenceLabel(cadence: PublishCadence | null | undefined): string | null {
  if (!cadence) return null;
  return LABELS[cadence] ?? null;
}

export function cadenceShortLabel(cadence: PublishCadence | null | undefined): string | null {
  if (!cadence) return null;
  return SHORT_LABELS[cadence] ?? null;
}

/**
 * Soft mismatch: declared timed cadence and last curriculum note is older than 2× interval.
 * Empty channels (no lastNoteAt) stay clean — never stale until there is observed activity.
 */
export function isCadenceStale(
  lastNoteAt: Date | string | null | undefined,
  cadence: PublishCadence | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isTimedPublishCadence(cadence)) return false;
  if (lastNoteAt == null || lastNoteAt === '') return false;
  const last = lastNoteAt instanceof Date ? lastNoteAt : new Date(lastNoteAt);
  if (Number.isNaN(last.getTime())) return false;
  const intervalMs = INTERVAL_DAYS[cadence] * 24 * 60 * 60 * 1000;
  return now.getTime() - last.getTime() > 2 * intervalMs;
}

export function staffCadenceStaleHint(cadence: PublishCadence | null | undefined): string | null {
  const label = cadenceShortLabel(cadence);
  if (!label || !isTimedPublishCadence(cadence)) return null;
  return `Followers may see that updates have been quieter than ${label} lately.`;
}
