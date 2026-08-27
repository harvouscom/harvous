/**
 * How long something was held open, bucketed rather than stored raw.
 *
 * Shared by every dwell-measured log: reading a chapter (`reading-event-kinds.ts`) and
 * reading a note (`note-visit-kinds.ts`). Only the thresholds differ between them, and
 * thresholds are exactly what a parameter is for. What does not differ is the vocabulary,
 * the strength ordering, and the report-twice state machine below — the subtle part, which
 * is worth having in one place so a fix to it lands everywhere.
 *
 * A raw millisecond dwell is both more than resurfacing needs and more than a log should
 * keep about someone: the questions it answers are "did they actually read this" and "did
 * they stay with it", and three buckets answer both. Bucketing on the client also means the
 * server never has to trust or re-derive a duration.
 *
 *   glance — opened and moved on; a wrong tap or a quick lookup
 *   read   — a real pass through it
 *   study  — stayed well past reading it once
 */

export const DWELL_BUCKETS = ['glance', 'read', 'study'] as const;

export type DwellBucket = (typeof DWELL_BUCKETS)[number];

export function isDwellBucket(value: string): value is DwellBucket {
  return (DWELL_BUCKETS as readonly string[]).includes(value);
}

/**
 * Ordering for "which of these two sessions was the fuller one".
 *
 * Both ends of every log lean on this: the client only sends a second event for a session
 * once the bucket has strengthened, and the server keeps the strongest bucket when
 * collapsing. Together they make a duplicate row harmless.
 */
const DWELL_STRENGTH: Record<DwellBucket, number> = { glance: 0, read: 1, study: 2 };

export function dwellStrength(bucket: DwellBucket): number {
  return DWELL_STRENGTH[bucket];
}

export interface DwellThresholds {
  /** Below this nothing is recorded at all — a bounce, or a tap being corrected. */
  minMs: number;
  readMs: number;
  studyMs: number;
}

export function dwellBucketFor(elapsedMs: number, thresholds: DwellThresholds): DwellBucket {
  if (!Number.isFinite(elapsedMs) || elapsedMs < thresholds.readMs) return 'glance';
  if (elapsedMs < thresholds.studyMs) return 'read';
  return 'study';
}

export function dwellIsRecordable(elapsedMs: number, thresholds: DwellThresholds): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= thresholds.minMs;
}

/** Buckets that count as having actually engaged with the thing, for resurfacing purposes. */
export function dwellCountsAsSubstantive(bucket: DwellBucket): boolean {
  return bucket !== 'glance';
}

/**
 * What a session should report right now, or null to stay quiet.
 *
 * A session can end more than once: the tab is hidden mid-way (report now, because the tab
 * may never come back), then the reader carries on and finally closes it. Reporting again is
 * only worth a row when the session grew into a fuller bucket, and every server-side collapse
 * keeps the strongest bucket, so the second row supersedes the first rather than competing
 * with it.
 */
export function nextDwellReport(
  elapsedMs: number,
  alreadyReported: DwellBucket | null,
  thresholds: DwellThresholds,
): DwellBucket | null {
  if (!dwellIsRecordable(elapsedMs, thresholds)) return null;
  const bucket = dwellBucketFor(elapsedMs, thresholds);
  if (alreadyReported && dwellStrength(bucket) <= dwellStrength(alreadyReported)) {
    return null;
  }
  return bucket;
}
