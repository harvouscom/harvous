/**
 * Shared vocabulary for the note-visit log (client + server).
 *
 * The note-side twin of `reading-event-kinds.ts`: that one measures reading Scripture, this
 * one measures reading your own notes. Both bind the same bucket math from
 * `dwell-buckets.ts`; only the numbers below differ, and they differ because a note is a
 * much shorter thing than a chapter.
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

export const NOTE_VISIT_DWELL_BUCKETS = DWELL_BUCKETS;

export type NoteVisitDwellBucket = DwellBucket;

export function isNoteVisitDwellBucket(value: string): value is NoteVisitDwellBucket {
  return isDwellBucket(value);
}

/**
 * Below this nothing is recorded — **deliberately the same 3s as reading**, not copied.
 *
 * The floor is not about how much there is to read; it is about what a wrong tap looks like,
 * and correcting a wrong tap takes the same couple of seconds whatever was tapped.
 */
export const NOTE_VISIT_DWELL_MIN_MS = 3_000;

/**
 * 12s, against reading's 20s.
 *
 * A chapter runs to twenty-odd verses; a note runs from a paragraph to a few. At an ordinary
 * reading pace 12s is around fifty words, which comfortably covers a pass through what this
 * app already calls a substantive note — `SUBSTANTIVE_CONTENT_MIN` in
 * `prototype-home-trends.ts` sets that bar at 80 characters.
 */
export const NOTE_VISIT_DWELL_READ_MS = 12_000;

/**
 * 90s, against reading's 4 minutes.
 *
 * Reading's `study` sits at roughly twelve times its read threshold — past one unhurried
 * pass through a chapter. A single unhurried pass through a note is fifteen or twenty
 * seconds, so 90s is five or six of them: sitting with it, or writing alongside it. Scaling
 * reading's ratio instead would put `study` beyond almost every real note session and waste
 * the third bucket entirely.
 */
export const NOTE_VISIT_DWELL_STUDY_MS = 90_000;

const NOTE_VISIT_DWELL: DwellThresholds = {
  minMs: NOTE_VISIT_DWELL_MIN_MS,
  readMs: NOTE_VISIT_DWELL_READ_MS,
  studyMs: NOTE_VISIT_DWELL_STUDY_MS,
};

export function noteVisitDwellBucket(elapsedMs: number): NoteVisitDwellBucket {
  return dwellBucketFor(elapsedMs, NOTE_VISIT_DWELL);
}

export function noteVisitDwellStrength(bucket: NoteVisitDwellBucket): number {
  return dwellStrength(bucket);
}

export function noteVisitDwellIsRecordable(elapsedMs: number): boolean {
  return dwellIsRecordable(elapsedMs, NOTE_VISIT_DWELL);
}

/**
 * Whether a visit counts as having actually read the note.
 *
 * This is the line the whole feature rests on. A glance is logged — the raw log stays an
 * honest record of what was opened — but it is not what "you were here" means, and every
 * consumer that ranks by visits asks this question first.
 */
export function noteVisitIsSubstantive(bucket: NoteVisitDwellBucket): boolean {
  return dwellCountsAsSubstantive(bucket);
}

export function nextNoteVisitDwellReport(
  elapsedMs: number,
  alreadyReported: NoteVisitDwellBucket | null,
): NoteVisitDwellBucket | null {
  return nextDwellReport(elapsedMs, alreadyReported, NOTE_VISIT_DWELL);
}
