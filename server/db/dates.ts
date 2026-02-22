/**
 * Date conversion helpers for the Drizzle ↔ application layer.
 *
 * Astro DB stores dates as ISO 8601 text strings (e.g. "2025-09-14T18:36:57.285Z").
 * With plain `text()` columns in Drizzle, dates come back as strings.
 * These helpers convert between ISO strings and JS Date objects.
 */

/** Convert an ISO string from the database to a JS Date, or null. */
export function toDate(val: string | null | undefined): Date | null {
  if (val == null) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** Convert a JS Date to an ISO string for database storage, or null. */
export function fromDate(date: Date | null | undefined): string | null {
  if (date == null) return null;
  return date.toISOString();
}

/** Get the current time as an ISO string (for inserts/updates). */
export function nowISO(): string {
  return new Date().toISOString();
}
