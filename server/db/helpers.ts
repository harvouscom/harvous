/**
 * Query helpers for Postgres (via Drizzle).
 *
 * `first()` returns the first element of a Drizzle result array, or undefined.
 */

/** Return the first element of an array, or undefined. */
export function first<T>(rows: T[]): T | undefined {
  return rows[0];
}
