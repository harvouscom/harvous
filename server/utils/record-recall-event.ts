/**
 * Record a Home recall carousel event. Non-throwing.
 * When action is open or complete and noteId is set, also bumps spaced-repetition stability.
 */

import { db, first, RecallEvents, Spaces, and, eq, isNull, or, type SQL } from '../db';
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
  /**
   * The room the reader was standing in. NULL/absent means personal Home — see
   * the column's own comment for why that is the honest default rather than a
   * missing value.
   */
  spaceId?: string | null;
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
  const { opportunityId, kind, action, noteId, spaceId } = body as Record<string, unknown>;
  if (typeof opportunityId !== 'string' || !opportunityId.trim()) return null;
  if (typeof kind !== 'string' || !isRecallOpportunityKind(kind)) return null;
  if (typeof action !== 'string' || !isRecallEventAction(action)) return null;
  if (noteId != null && typeof noteId !== 'string') return null;
  const trimmedNoteId = typeof noteId === 'string' ? noteId.trim() : '';
  /*
    Not validated against the reader's memberships, deliberately. This column
    partitions one person's own suppression history; it grants nothing and is
    never read across users, so a bogus value can only cost the sender their own
    cooldowns in a bucket nothing else reads. A membership check here would be a
    query on the hot write path buying no access control.
  */
  const trimmedSpaceId = typeof spaceId === 'string' ? spaceId.trim() : '';
  return {
    opportunityId: opportunityId.trim(),
    kind,
    action,
    noteId: trimmedNoteId || null,
    spaceId: trimmedSpaceId || null,
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
      spaceId: input.spaceId ?? null,
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

/**
 * The room predicate for reading one person's suppression history.
 *
 * One rule, in one place, because it is easy to state and easy to get subtly wrong: **NULL
 * means personal Home.** Every row written before `RecallEvents.spaceId` existed came from
 * there — recall only ever ran in the personal space — so those rows are correct as they
 * stand and must keep suppressing where they were made. That is what makes the column a
 * no-backfill change.
 *
 * Asked for the personal space (or for nothing), the answer includes NULL rows. Asked for any
 * other room, it does not: a dismissal made in a life group must not follow you home, and one
 * made at home must not silence the group.
 *
 * The personal check is a real lookup rather than trusting the caller, because "is this my
 * Home" decides whether a legacy row applies, and a client that guessed wrong would silently
 * lose or leak a reader's own dismissals.
 */
export async function resolveRecallRoomScope(
  userId: string,
  requestedSpaceId: string | null,
): Promise<SQL | undefined> {
  if (!requestedSpaceId) return isNull(RecallEvents.spaceId);

  const personal = first(
    await db
      .select({ id: Spaces.id })
      .from(Spaces)
      .where(
        and(
          eq(Spaces.id, requestedSpaceId),
          eq(Spaces.userId, userId),
          eq(Spaces.type, 'personal'),
        ),
      )
      .limit(1),
  );

  return personal
    ? or(isNull(RecallEvents.spaceId), eq(RecallEvents.spaceId, requestedSpaceId))
    : eq(RecallEvents.spaceId, requestedSpaceId);
}
