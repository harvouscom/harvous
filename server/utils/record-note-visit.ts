/**
 * Record one note-visit session — a note held open for some length of time — and read the
 * log back as a per-note aggregate. Non-throwing: the note pane must never stall or fail on
 * its own analytics.
 */

import { db, Notes, NoteVisitEvents, and, desc, eq, gte } from '../db';
import { nowISO } from '../db/dates';
import { generateTimestampId } from '@/utils/ids';
import {
  isNoteVisitDwellBucket,
  noteVisitIsSubstantive,
  type NoteVisitDwellBucket,
} from '@/utils/note-visit-kinds';
import { isNoteVisitEventsTableMissing } from './pg-undefined-relation';
import { noteTouch, touchNodes } from './study-bible-layer';
import { NOTE_OPENED_SOURCE } from '@/utils/study-bible-source-copy';
import { first } from '../db/helpers';

export type RecordNoteVisitInput = {
  noteId: string;
  dwellBucket: NoteVisitDwellBucket;
};

/**
 * How far back the aggregate looks.
 *
 * Shorter than reading's 180 days, and for a different question. Reading's window is long
 * because working through a book takes months. This one answers "do you keep coming back to
 * this note", which is a claim about a current habit — and a return from six months ago is
 * not evidence of one.
 */
export const NOTE_VISIT_WINDOW_DAYS = 90;

/** Bound on rows read per user. Well past a heavy reader's 90 days. */
export const NOTE_VISIT_MAX_ROWS = 2000;

export interface NoteVisitAggregate {
  noteId: string;
  /** Substantive (read | study) visits in the window. Glances do not count. */
  count: number;
  /** ISO timestamp of the most recent substantive visit. */
  lastVisitedAt: string;
}

/**
 * Reduce raw NoteVisitEvents rows to one entry per note.
 *
 * Pure so it can be tested without a database. `rows` must arrive newest-first — the query
 * orders by createdAt desc — so the first row seen for a note carries the timestamp.
 *
 * Collapses to a *count* rather than to the strongest bucket, which is where this differs
 * from `collapseReadingHistory`, because the two logs are asked different questions. Reading
 * asks "has this chapter been read at all", so one strong reading settles it. Resurfacing
 * asks "how often do you come back to this note", and the answer to that is a number.
 *
 * Glances are dropped here rather than at write time. The log stays an honest record of what
 * was opened; deciding what counts as reading belongs with the consumer that ranks by it.
 */
export function collapseNoteVisits(
  rows: {
    noteId: string;
    dwellBucket: string;
    createdAt: string | Date | null;
  }[],
): NoteVisitAggregate[] {
  const seen = new Map<string, NoteVisitAggregate>();
  for (const row of rows) {
    if (!row.noteId || !isNoteVisitDwellBucket(row.dwellBucket)) continue;
    if (!noteVisitIsSubstantive(row.dwellBucket)) continue;
    const createdAt =
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? '');
    if (!createdAt) continue;

    const existing = seen.get(row.noteId);
    if (!existing) {
      seen.set(row.noteId, { noteId: row.noteId, count: 1, lastVisitedAt: createdAt });
      continue;
    }
    existing.count += 1;
  }
  return [...seen.values()];
}

/** Validate a posted visit rather than trusting the sender. */
export function validateNoteVisitInput(body: unknown): RecordNoteVisitInput | null {
  if (!body || typeof body !== 'object') return null;
  const { noteId, dwellBucket } = body as Record<string, unknown>;

  if (typeof noteId !== 'string' || noteId.trim().length === 0) return null;
  if (typeof dwellBucket !== 'string' || !isNoteVisitDwellBucket(dwellBucket)) return null;

  return { noteId: noteId.trim(), dwellBucket };
}

/**
 * Append one visit.
 *
 * Ownership is checked here rather than trusted from the client, mirroring
 * `recordNoteRecallEngaged`. The client already declines to measure a note shared with you,
 * but that gate cannot be the guarantee: a note can be shared *after* it was opened, and an
 * append-only log is exactly the wrong place to discover you trusted the caller.
 */
export async function recordNoteVisit(
  userId: string,
  input: RecordNoteVisitInput,
): Promise<boolean> {
  try {
    const owned = first(
      await db
        // The title comes back with the ownership check rather than in a second query: the
        // node layer wants it, and this select is already on the path.
        .select({ id: Notes.id, title: Notes.title })
        .from(Notes)
        .where(and(eq(Notes.id, input.noteId), eq(Notes.userId, userId)))
        .limit(1),
    );
    if (!owned) return false;

    await db.insert(NoteVisitEvents).values({
      id: generateTimestampId('notevisit'),
      userId,
      noteId: input.noteId,
      dwellBucket: input.dwellBucket,
      createdAt: nowISO(),
    });
    // A glance is contact; staying is coming back on purpose. The counters keep them apart
    // so "you keep returning to this" can mean returning rather than passing through.
    const substantive = noteVisitIsSubstantive(input.dwellBucket);
    void touchNodes(userId, [
      noteTouch({
        noteId: input.noteId,
        title: owned.title,
        signal: substantive ? 'revisit' : 'exposure',
        at: new Date(),
        sourceLabel: substantive ? NOTE_OPENED_SOURCE : null,
      }),
    ]);
    return true;
  } catch (error) {
    if (isNoteVisitEventsTableMissing(error)) {
      console.warn('[recordNoteVisit] NoteVisitEvents table missing; skipping. Run `npm run db:push`.');
      return false;
    }
    console.error('[recordNoteVisit]', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Per-note visit aggregate for this user, for the ranking maps on Home.
 *
 * Non-throwing by contract: this rides on the fingerprints response, and that response is
 * inside Home's readiness gate. A missing table has to read as "no visits yet", never as a
 * failed request that strands Home on loading dots.
 */
export async function getUserNoteVisitAggregate(userId: string): Promise<NoteVisitAggregate[]> {
  try {
    const since = new Date(Date.now() - NOTE_VISIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        noteId: NoteVisitEvents.noteId,
        dwellBucket: NoteVisitEvents.dwellBucket,
        createdAt: NoteVisitEvents.createdAt,
      })
      .from(NoteVisitEvents)
      .where(and(eq(NoteVisitEvents.userId, userId), gte(NoteVisitEvents.createdAt, since)))
      .orderBy(desc(NoteVisitEvents.createdAt))
      .limit(NOTE_VISIT_MAX_ROWS);
    return collapseNoteVisits(rows);
  } catch (error) {
    if (!isNoteVisitEventsTableMissing(error)) {
      console.error('[getUserNoteVisitAggregate]', error instanceof Error ? error.message : error);
    }
    return [];
  }
}
