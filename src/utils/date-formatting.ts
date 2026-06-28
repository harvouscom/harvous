/** Short month names for "MMM YYYY" format. Avoids iOS PWA ignoring en-US and showing full month. */
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Full month names for default note titles (e.g. "June 28, 2026"). Local calendar fields. */
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Default note title when the user has not set one — long local date, e.g. "June 28, 2026".
 * Hard-coded month names avoid iOS PWA locale quirks (same as getRelativeTime).
 */
export function formatNoteDefaultTitle(date: Date): string {
  return `${MONTHS_LONG[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Format a date as "MMM YYYY" in UTC. Uses hard-coded month abbreviations to avoid
 * iOS PWA ignoring toLocaleDateString('en-US', { month: 'short' }) and showing full month names.
 */
export function formatMonthYearUTC(date: Date): string {
  return `${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();

  // Handle future timestamps (negative diff) - treat as "Just now"
  // This can happen due to clock skew between server and client
  if (diffInMs < 0) {
    return "Just now";
  }

  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays > 30) {
    // Use hard-coded month names instead of toLocaleDateString to avoid iOS PWA
    // ignoring the 'en-US' locale hint and returning unexpected formats.
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  } else if (diffInDays > 0) {
    return diffInDays === 1 ? "1 day ago" : `${diffInDays} days ago`;
  } else if (diffInHours > 0) {
    return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;
  } else if (diffInMinutes > 0) {
    return diffInMinutes === 1 ? "1 minute ago" : `${diffInMinutes} minutes ago`;
  } else {
    return "Just now";
  }
}
