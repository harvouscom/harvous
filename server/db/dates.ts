/**
 * Date helpers for the database layer.
 *
 * With Postgres TIMESTAMPTZ columns (mode: 'date'), Drizzle returns native
 * JS Date objects. These helpers are simplified from the old text-based approach.
 */

/** Get the current time as a Date (for inserts/updates). */
export function now(): Date {
  return new Date();
}

/**
 * @deprecated Columns now return Date objects natively. Kept as a shim during migration.
 * Will be removed once all callers are updated.
 */
export function toDate(val: Date | string | null | undefined): Date | null {
  if (val == null) return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * @deprecated Columns now accept Date objects natively. Kept as a shim during migration.
 * Will be removed once all callers are updated.
 */
export function fromDate(date: Date | null | undefined): Date | null {
  if (date == null) return null;
  return date instanceof Date ? date : new Date(date);
}

// Legacy alias — use now() instead
export const nowISO = now;
