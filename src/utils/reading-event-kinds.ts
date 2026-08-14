/** Shared vocabulary for the reading-event log (client + server). */

/**
 * How long a chapter was held open, bucketed rather than stored raw.
 *
 * A raw millisecond dwell is both more than resurfacing needs and more than a reading
 * log should keep about someone: the questions it answers are "did they actually read
 * this" and "did they stay with it", and three buckets answer both. Bucketing on the
 * client also means the server never has to trust or re-derive a duration.
 *
 *   glance — opened and moved on; a wrong tap or a quick lookup
 *   read   — a chapter's worth of attention
 *   study  — stayed well past reading it once
 */
export const READING_DWELL_BUCKETS = ['glance', 'read', 'study'] as const;

export type ReadingDwellBucket = (typeof READING_DWELL_BUCKETS)[number];

export function isReadingDwellBucket(value: string): value is ReadingDwellBucket {
  return (READING_DWELL_BUCKETS as readonly string[]).includes(value);
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

export function readingDwellBucket(elapsedMs: number): ReadingDwellBucket {
  if (!Number.isFinite(elapsedMs) || elapsedMs < READING_DWELL_READ_MS) return 'glance';
  if (elapsedMs < READING_DWELL_STUDY_MS) return 'read';
  return 'study';
}

/** Buckets that count as having actually read the chapter, for resurfacing purposes. */
export function readingDwellCountsAsRead(bucket: ReadingDwellBucket): boolean {
  return bucket !== 'glance';
}

/**
 * Ordering for "which of these two readings was the fuller one".
 *
 * Both ends of the log lean on this: the client only sends a second event for a session
 * once the bucket has strengthened, and the server keeps the strongest bucket per chapter
 * when collapsing. Together they make a duplicate row harmless.
 */
const DWELL_STRENGTH: Record<ReadingDwellBucket, number> = { glance: 0, read: 1, study: 2 };

export function readingDwellStrength(bucket: ReadingDwellBucket): number {
  return DWELL_STRENGTH[bucket];
}

/**
 * Below this, nothing is recorded at all: a passage passed through in a second or two was
 * a mis-tap or a bounce, and logging it would put chapters nobody looked at into the record
 * of what they read.
 */
export const READING_DWELL_MIN_MS = 3_000;

export function readingDwellIsRecordable(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= READING_DWELL_MIN_MS;
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
  if (!readingDwellIsRecordable(elapsedMs)) return null;
  const bucket = readingDwellBucket(elapsedMs);
  if (alreadyReported && readingDwellStrength(bucket) <= readingDwellStrength(alreadyReported)) {
    return null;
  }
  return bucket;
}
