/**
 * `VotdPublishHistory.publishedDate` is stored as the editorial calendar day used when publishing
 * (UTC `YYYY-MM-DD` from `publish-daily`). The client sends `X-Votd-Timezone`; the API first matches
 * that string to the user's local calendar date, and if no row exists for that exact date,
 * `/api/featured/items` and `/api/votd/today` (handler in `server/routes/health.ts`) fall back to the latest published verse with
 * `publishedDate <=` that local date so the card does not vanish before the next publish lands.
 */

const TZ_SAFE = /^[A-Za-z0-9_+/\-]+$/;

export function isValidIanaTimeZone(tz: string): boolean {
  if (!TZ_SAFE.test(tz) || tz.length > 120) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD for `date` interpreted in `timeZone` (IANA). Falls back to UTC on invalid zone. */
export function getLocalCalendarDateString(timeZone: string, date: Date): string {
  const zone = isValidIanaTimeZone(timeZone) ? timeZone : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

/**
 * Seconds from `date` until the next local midnight in `timeZone` (at least 1).
 *
 * The passage changes at the reader's midnight, so no cache of it may outlive that. Computed from
 * the local wall clock, which is right on every day but the ones a DST change lands on — and then
 * it is off by the hour change at most, in the short direction or an hour too long on a day the
 * caller already caps at an hour.
 */
export function secondsUntilLocalMidnight(timeZone: string, date: Date): number {
  const zone = isValidIanaTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsed = n('hour') * 3600 + n('minute') * 60 + n('second');
  return Math.max(1, 86_400 - elapsed);
}
