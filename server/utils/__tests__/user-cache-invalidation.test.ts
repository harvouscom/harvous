import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `invalidateUserCache` used to stamp `clerkDataUpdatedAt` with
 * `new Date(0).toISOString()` — a string — into a `ts()` column.
 *
 * Drizzle's date-mode driver mapper is literally `(value) => value.toISOString()`, so a
 * string argument threw `TypeError: value.toISOString is not a function`. Both callers
 * wrap the call in try/catch, so nothing 500'd — the invalidation just never happened,
 * and stale Clerk profile data (name, email, avatar) kept being served until the normal
 * TTL expired.
 *
 * This pins the contract rather than the call: whatever we hand a timestamp column has to
 * survive the mapper.
 */
const drizzleDateModeMapper = (value: unknown) => (value as Date).toISOString();

describe('timestamp column values', () => {
  it('rejects an ISO string, the way Drizzle does at runtime', () => {
    expect(() => drizzleDateModeMapper(new Date(0).toISOString())).toThrow(TypeError);
  });

  it('accepts a Date', () => {
    expect(drizzleDateModeMapper(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
  });

  it('no timestamp column in user-cache is written as a stringified date', () => {
    // Source-level, because this module only reaches the column through a live db call.
    // Pinning the defect shape is what would have caught the original bug: every write
    // to a ts() column must hand over a Date, never `.toISOString()`.
    // Same source-reading pattern as generation-4c-hardening.test.ts.
    const src = readFileSync(resolve(process.cwd(), 'server/utils/user-cache.ts'), 'utf8');

    const writes = [...src.matchAll(/^\s*(clerkDataUpdatedAt|createdAt|updatedAt):\s*(.+)$/gm)]
      .map((m) => `${m[1]}: ${m[2]}`)
      .filter((line) => line.includes('toISOString'));

    expect(writes).toEqual([]);
  });
});
