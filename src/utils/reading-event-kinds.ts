/**
 * Shared vocabulary for the reading-event log (client + server).
 *
 * The bucket math itself lives in `dwell-buckets.ts`, shared with the note-visit log; this
 * file is the reading-specific binding of it. Every export below keeps the name, signature
 * and value it has always had, so nothing that imports from here needs to know the seam
 * moved — `reading-event-kinds.test.ts` and `reading-dwell-report.test.ts` are the check on
 * that, and neither should ever need editing because of this file.
 */

import {
  DWELL_BUCKETS,
  dwellBucketFor,
  dwellCountsAsSubstantive,
  dwellIsRecordable,
  dwellStrength,
  isDwellBucket,
  nextDwellReport,
  type DwellBucket,
  type DwellThresholds,
} from './dwell-buckets';

/**
 * How long a chapter was held open.
 *
 *   glance — opened and moved on; a wrong tap or a quick lookup
 *   read   — a chapter's worth of attention
 *   study  — stayed well past reading it once
 */
export const READING_DWELL_BUCKETS = DWELL_BUCKETS;

export type ReadingDwellBucket = DwellBucket;

export function isReadingDwellBucket(value: string): value is ReadingDwellBucket {
  return isDwellBucket(value);
}

/**
 * Bucket boundaries in milliseconds.
 *
 * 20s is about as long as a wrong tap survives before it is corrected, and roughly the
 * floor for reading a short chapter. 4 minutes is past a single unhurried pass through
 * an average chapter, so what lands in `study` is re-reading, or reading alongside
 * something else.
 */
export const READING_DWELL_READ_MS = 20_000;
export const READING_DWELL_STUDY_MS = 240_000;

/**
 * Below this, nothing is recorded at all: a passage passed through in a second or two was
 * a mis-tap or a bounce, and logging it would put chapters nobody looked at into the record
 * of what they read.
 */
export const READING_DWELL_MIN_MS = 3_000;

const READING_DWELL: DwellThresholds = {
  minMs: READING_DWELL_MIN_MS,
  readMs: READING_DWELL_READ_MS,
  studyMs: READING_DWELL_STUDY_MS,
};

export function readingDwellBucket(elapsedMs: number): ReadingDwellBucket {
  return dwellBucketFor(elapsedMs, READING_DWELL);
}

/** Buckets that count as having actually read the chapter, for resurfacing purposes. */
export function readingDwellCountsAsRead(bucket: ReadingDwellBucket): boolean {
  return dwellCountsAsSubstantive(bucket);
}

/**
 * Ordering for "which of these two readings was the fuller one".
 *
 * Both ends of the log lean on this: the client only sends a second event for a session
 * once the bucket has strengthened, and the server keeps the strongest bucket per chapter
 * when collapsing. Together they make a duplicate row harmless.
 */
export function readingDwellStrength(bucket: ReadingDwellBucket): number {
  return dwellStrength(bucket);
}

export function readingDwellIsRecordable(elapsedMs: number): boolean {
  return dwellIsRecordable(elapsedMs, READING_DWELL);
}

/**
 * What a reading session should report right now, or null to stay quiet.
 *
 * A session can end more than once: the tab is hidden mid-chapter (report now, because the
 * tab may never come back), then the reader keeps reading and finally closes it. Reporting
 * again is only worth a row when the reading grew into a fuller bucket, and the server keeps
 * the strongest bucket per chapter, so the second row supersedes the first rather than
 * competing with it.
 */
export function nextReadingDwellReport(
  elapsedMs: number,
  alreadyReported: ReadingDwellBucket | null,
): ReadingDwellBucket | null {
  return nextDwellReport(elapsedMs, alreadyReported, READING_DWELL);
}
