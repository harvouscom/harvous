/**
 * Verse of the Day is keyed by `VotdPublishHistory.publishedDate` (YYYY-MM-DD, editorial UTC date).
 * For display, we match that string to the user's local calendar date so the card stays until local midnight.
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
