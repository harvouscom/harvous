/**
 * Record a Home recall carousel event. Non-throwing.
 * When action is open or complete and noteId is set, also bumps spaced-repetition stability.
 */

import { db, RecallEvents } from '../db';
import { nowISO } from '../db/dates';
import { generateTimestampId } from '@/utils/ids';
import {
  isRecallEventAction,
  isRecallOpportunityKind,
  isRecallSuppressionAction,
  type RecallEventAction,
  type RecallOpportunityKind,
  type RecallSuppressionAction,
} from '@/utils/recall-opportunity-kinds';
import { isRecallEventsTableMissing } from './pg-undefined-relation';
import { noteTouch, touchNodes } from './study-bible-layer';
import { RESURFACED_SOURCE } from '@/utils/study-bible-source-copy';
import { recordNoteRecallEngaged } from './note-recall-state';

export type RecordRecallEventInput = {
  opportunityId: string;
  kind: RecallOpportunityKind;
  action: RecallEventAction;
  noteId?: string | null;
};

/** One row's worth of recall history, as returned to the client. */
export type RecallHistoryEntry = {
  opportunityId: string;
  action: RecallSuppressionAction;
  createdAt: string;
};

/**
 * Reduce raw RecallEvents rows to the most recent entry per (opportunityId, action).
 *
 * `impression` is dropped: it records that a card was on screen, which says nothing about
 * whether it should be shown again. The rest either suppress — each with its own window, and
 * `dismissed` with none — or, in `restored`'s case, cancel the ones older than it.
 *
 * Kept per *action* rather than per opportunity, because the client needs both sides: a
 * `restored` only undoes what came before it, so collapsing to one row per opportunity would
 * throw away the very row the comparison is against.
 *
 * Pure so it can be tested without a database. `rows` must arrive newest-first — the
 * query orders by createdAt desc — so the first row seen for a pair wins.
 */
export function collapseRecallHistory(
  rows: { opportunityId: string; action: string; createdAt: string | Date | null }[],
): RecallHistoryEntry[] {
  const seen = new Map<string, RecallHistoryEntry>();
  for (const row of rows) {
    if (!isRecallSuppressionAction(row.action)) continue;
    if (!row.opportunityId) continue;
    /*
     * Action first, space-separated — and not the NUL byte this used to use.
     *
     * A NUL is the obvious collision-proof separator and it worked, but git's binary
     * detection scans the first 8000 bytes of a file for one, so this single character made
     * the whole file binary: every diff of it rendered as `Bin` with no text to read. A
     * source file whose diffs nobody can read is a poor trade for a separator.
     *
     * Still unambiguous. `action` comes from the closed `RECALL_EVENT_ACTIONS` allowlist —
     * lowercase words, no spaces — so the first space is always the boundary. Putting it
     * first is what makes that true: `opportunityId` can contain spaces and colons
     * (`passage:John 3:16`), so with the id leading, a space could fall on either side.
     *
     * The key is local to this map and never persisted or parsed back, so the format is free.
     */
    const key = `${row.action} ${row.opportunityId}`;
    if (seen.has(key)) continue;
    const createdAt =
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? '');
    if (!createdAt) continue;
    seen.set(key, { opportunityId: row.opportunityId, action: row.action, createdAt });
  }
  return [...seen.values()];
}

export function validateRecallEventInput(body: unknown): RecordRecallEventInput | null {
  if (!body || typeof body !== 'object') return null;
  const { opportunityId, kind, action, noteId } = body as Record<string, unknown>;
  if (typeof opportunityId !== 'string' || !opportunityId.trim()) return null;
  if (typeof kind !== 'string' || !isRecallOpportunityKind(kind)) return null;
  if (typeof action !== 'string' || !isRecallEventAction(action)) return null;
  if (noteId != null && typeof noteId !== 'string') return null;
  const trimmedNoteId = typeof noteId === 'string' ? noteId.trim() : '';
  return {
    opportunityId: opportunityId.trim(),
    kind,
    action,
    noteId: trimmedNoteId || null,
  };
}

export async function recordRecallEvent(userId: string, input: RecordRecallEventInput): Promise<boolean> {
  try {
    await db.insert(RecallEvents).values({
      id: generateTimestampId('recallevent'),
      userId,
      opportunityId: input.opportunityId,
      kind: input.kind,
      action: input.action,
      noteId: input.noteId ?? null,
      createdAt: nowISO(),
    });

    // `complete` counts as engagement too, and more strongly than `open` — the note it names
    // is one the suggestion actually led you to write or connect, not merely one you looked at.
    if ((input.action === 'open' || input.action === 'complete') && input.noteId) {
      await recordNoteRecallEngaged(userId, input.noteId);
      // Arriving through a Home suggestion is still a return, and worth telling apart from
      // one the reader navigated to themselves when the row later explains why it is there.
      void touchNodes(userId, [
        noteTouch({
          noteId: input.noteId,
          signal: 'revisit',
          at: new Date(),
          sourceLabel: RESURFACED_SOURCE,
        }),
      ]);
    }

    return true;
  } catch (error) {
    if (isRecallEventsTableMissing(error)) {
      console.warn('[recordRecallEvent] RecallEvents table missing; skipping. Run `npm run db:push`.');
      return false;
    }
    console.error('[recordRecallEvent]', error instanceof Error ? error.message : error);
    return false;
  }
}
