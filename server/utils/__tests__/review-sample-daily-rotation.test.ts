/**
 * The free account's one question changes day to day.
 *
 * `pickSampleReference` has rotated by the day for a while and its docblock says so, naming the
 * exact failure it fixed: "a reader with any passage at all met the identical verse every
 * morning — only the blanks moving". But `buildReviewSample` never adopted it. It mapped the
 * reader's own references in storage order, took the first that produced an exercise, and only
 * ever called the rotating picker with an empty list — so the fix lived in the helper while the
 * caller kept the bug. A promise in a docblock is not a guard.
 *
 * Source-inspected because the builder is database calls end to end. What this can hold is the
 * shape: that the seeded offset is applied to the reader's own list before the walk, and that
 * the walk survives, since it is what lets a verse too short to hide anything in fall through to
 * another of theirs rather than to the well-known list.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'server/utils/review-service.ts'), 'utf8');
const builder = source.slice(
  source.indexOf('export async function buildReviewSample'),
  source.indexOf('export async function gradeReviewSample'),
);

describe('buildReviewSample', () => {
  it('offsets the reader’s own passages by the day', () => {
    expect(builder).toContain('seededIndex(seed, own.length)');
  });

  it('still walks the rest, so a short verse falls through to another of theirs', () => {
    // Rotation alone would be a regression: the day's pick may have too few words to blank.
    expect(builder).toContain('own.slice(start)');
    expect(builder).toContain('own.slice(0, start)');
    expect(builder).toContain('for (const candidate of candidates)');
  });

  it('does not take the first stored reference regardless of the day', () => {
    // The exact shape of the bug: `own.map(...)` with no offset applied first.
    expect(builder).not.toMatch(/const candidates[^=]*=\s*own\.map\(/);
  });

  it('keeps the well-known verse as the last resort', () => {
    expect(builder).toContain("pickSampleReference({ ownReferences: [], seed })");
  });

  it('seeds by reader and day, so two people do not share a question', () => {
    expect(builder).toContain('sampleSeed(userId, dayKey)');
  });
});
