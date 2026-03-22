/**
 * Query helpers for Postgres (via Drizzle).
 *
 * SQLite's `.get()` returns a single row; Postgres always returns arrays.
 * `first()` bridges the gap with minimal code changes.
 */

/** Return the first element of an array, or undefined. */
export function first<T>(rows: T[]): T | undefined {
  return rows[0];
}
