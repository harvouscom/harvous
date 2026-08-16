/**
 * Sequence Threads — an authored order over a Thread's notes, and the step a
 * cohort is on.
 *
 * A collection Thread is a bag of notes sorted by recency. A sequence Thread
 * is a study plan: someone chose the order, and the group moves through it
 * together. Everything here is about keeping that order honest when the notes
 * underneath it change.
 *
 * Two invariants worth stating once:
 *
 *   - The stored order is advisory, live membership is authoritative. A note
 *     removed from the space stays in `sequenceNoteIds` until the next write;
 *     readers filter it out rather than trusting the list.
 *   - Dimming future steps is PACING, NOT ACCESS CONTROL. Members can already
 *     reach every note in the space through its notes list and search — the
 *     Thread is not the access boundary, SpaceNotes is. Hiding steps here
 *     would buy nothing and would make "Step 3 of 8" a lie.
 */

import {
  db,
  Notes,
  NoteThreads,
  SpaceMemberships,
  SpaceNotes,
  ThreadProgress,
  eq,
  and,
  isNull,
} from '../db';
import type { SpaceRole, SpaceRow } from './space-access';
import { isActualSpaceOwner } from './space-access';

export type ThreadSequenceMode = 'collection' | 'sequence';

export type SequenceState = {
  /** Authored order, filtered to notes still live in the Thread. */
  orderedNoteIds: string[];
  /** The cohort's current step, healed to the first step if the pointer died. */
  currentNoteId: string | null;
  /** 1-based, for "Step {currentIndex} of {total}". 0 when there are no steps. */
  currentIndex: number;
  total: number;
  /** True when the stored columns disagree with the resolved state. */
  needsRewrite: boolean;
};

export function isSequenceMode(mode: string | null | undefined): boolean {
  return mode === 'sequence';
}

/**
 * Whether this Thread has an order somebody arranged.
 *
 * Separate from `isSequenceMode` because the two questions came apart: a stored
 * order is "these notes go in this order", while sequence mode adds the pacing
 * on top — numbered steps, a current step, the read-together pulse. Reordering
 * a collection Thread should do the first without turning on the second, so
 * every read applies the order whenever there is one and keeps the step
 * furniture gated on the mode.
 *
 * Cheap: `sequenceNoteIds` is a short JSON array on the Thread row, already
 * loaded wherever this is asked.
 */
export function hasStoredThreadOrder(thread: { sequenceNoteIds?: string | null }): boolean {
  return parseSequenceNoteIds(thread.sequenceNoteIds).length > 0;
}

export function parseSequenceNoteIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'string' || !entry) continue;
      // A duplicated id would make "step 3" ambiguous — first position wins.
      if (seen.has(entry)) continue;
      seen.add(entry);
      ids.push(entry);
    }
    return ids;
  } catch {
    return [];
  }
}

export function serializeSequenceNoteIds(ids: string[]): string {
  return JSON.stringify(ids);
}

/**
 * Reconcile the stored order against the notes actually in the Thread.
 *
 * Notes live in the Thread but missing from the stored order are appended in
 * the caller's order (they were attached by some path that doesn't know about
 * sequences — attaching a note should never make it invisible).
 */
export function resolveSequenceState(
  thread: { sequenceNoteIds?: string | null; sequenceCurrentNoteId?: string | null },
  liveNoteIds: string[],
): SequenceState {
  const live = new Set(liveNoteIds);
  const stored = parseSequenceNoteIds(thread.sequenceNoteIds);

  const orderedNoteIds = stored.filter((id) => live.has(id));
  const known = new Set(orderedNoteIds);
  const appended = liveNoteIds.filter((id) => !known.has(id));
  orderedNoteIds.push(...appended);

  const storedPointer = thread.sequenceCurrentNoteId ?? null;
  const pointerAlive = storedPointer !== null && orderedNoteIds.includes(storedPointer);
  const currentNoteId = pointerAlive ? storedPointer : orderedNoteIds[0] ?? null;

  const currentIndex = currentNoteId ? orderedNoteIds.indexOf(currentNoteId) + 1 : 0;

  return {
    orderedNoteIds,
    currentNoteId,
    currentIndex,
    total: orderedNoteIds.length,
    needsRewrite:
      appended.length > 0 ||
      orderedNoteIds.length !== stored.length ||
      currentNoteId !== storedPointer,
  };
}

/**
 * Sort notes into the authored order.
 *
 * Anything not in the stored order sorts last, keeping its incoming relative
 * order — a note attached by some other path should appear at the end of the
 * plan, not silently jump to step 1.
 */
export function sortNotesBySequence<T extends { id: string }>(
  notes: T[],
  thread: { sequenceNoteIds?: string | null },
): T[] {
  const order = new Map(parseSequenceNoteIds(thread.sequenceNoteIds).map((id, i) => [id, i]));
  const rank = (note: T) => order.get(note.id) ?? Number.MAX_SAFE_INTEGER;
  return notes
    .map((note, index) => ({ note, index }))
    .sort((a, b) => rank(a.note) - rank(b.note) || a.index - b.index)
    .map((entry) => entry.note);
}

/**
 * Every note currently in a Thread — the list the stored order is checked
 * against.
 *
 * Ids only, and deliberately unpaginated: "Step 3 of 8" has to count the whole
 * plan, so it cannot be derived from a page of notes.
 */
export async function loadLiveThreadNoteIds(
  threadId: string,
  spaceId: string | null,
): Promise<string[]> {
  if (!spaceId) {
    const rows = await db
      .select({ noteId: NoteThreads.noteId })
      .from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId));
    return rows.map((row) => row.noteId);
  }
  const rows = await db
    .select({ noteId: NoteThreads.noteId })
    .from(NoteThreads)
    .innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
    .innerJoin(SpaceNotes, and(eq(SpaceNotes.noteId, Notes.id), eq(SpaceNotes.spaceId, spaceId)))
    .where(and(eq(NoteThreads.threadId, threadId), isNull(SpaceNotes.removedAt)));
  return rows.map((row) => row.noteId);
}

/**
 * How many people have opened each step, for the person shepherding the room.
 *
 * Counts only. The per-user rows exist because a count has to be computed from
 * something, but nothing here returns a userId, and no caller may add one: the
 * church surfaces promise "how many, never who", and a study plan is where that
 * promise matters most. See the ThreadProgress docblock.
 *
 * `memberCount` is every active membership including staff — a leader walking
 * the plan with the room is part of the room, and excluding them would make
 * the denominator disagree with the people count on the same screen.
 */
export async function readTogetherPulse(
  threadId: string,
  spaceId: string,
): Promise<{
  memberCount: number;
  openedCountByNoteId: Record<string, number>;
  completedCount: number;
}> {
  const [progressRows, memberRows] = await Promise.all([
    db
      .select({
        openedNoteIds: ThreadProgress.openedNoteIds,
        completedAt: ThreadProgress.completedAt,
      })
      .from(ThreadProgress)
      .where(eq(ThreadProgress.threadId, threadId)),
    db
      .select({ userId: SpaceMemberships.userId })
      .from(SpaceMemberships)
      .where(eq(SpaceMemberships.spaceId, spaceId)),
  ]);

  const openedCountByNoteId: Record<string, number> = {};
  for (const row of progressRows) {
    // One person counts once per step however many times they opened it.
    for (const noteId of new Set(parseSequenceNoteIds(row.openedNoteIds))) {
      openedCountByNoteId[noteId] = (openedCountByNoteId[noteId] ?? 0) + 1;
    }
  }

  return {
    memberCount: new Set(memberRows.map((row) => row.userId)).size,
    openedCountByNoteId,
    /* How many finished — a count, exactly like the per-step counts above, and
       under the same rule: how many, never who. A leader learns the room is
       through; they never learn that a particular person is not. */
    completedCount: progressRows.filter((row) => row.completedAt).length,
  };
}

/** Add a step to someone's opened set, leaving the rest of their row alone. */
export function withOpenedStep(existing: string | null | undefined, noteId: string): string[] {
  const opened = parseSequenceNoteIds(existing);
  return opened.includes(noteId) ? opened : [...opened, noteId];
}

/**
 * Who may author a Thread's structure — its mode, its order, its current step.
 *
 * This is the server-side counterpart of the client's
 * `canManageStudyThreadsInSharedSpace`, and it deliberately widens what the
 * server allowed before: thread creation and pinning gate on
 * `isActualSpaceOwner` alone, so in a church space the one staff member who
 * happened to create the room was the only person who could ever touch it.
 * Staff turn over; the room outlives them. Authority flows from the
 * membership role — which admin sync-staff maintains — with the canonical
 * owner as the other way in.
 *
 * Ministry channels were closed here while they were read-only in the pilot,
 * on the reasoning that there is no sequence to run in a room nobody can
 * compose in. That reasoning conflated two different things. Composing is
 * indeed staff-only in a channel — `canAuthorInSpace` restricts `public` to
 * leader+ — but *walking* a sequence asks nothing of the walker: the steps are
 * authored by staff and the congregation reads them in order and takes their
 * own notes elsewhere. A published study is precisely the artifact a room
 * nobody can compose in exists to carry.
 *
 * So `public` falls through to the same leader+ rule as `shared`, which lines
 * this up exactly with `canAuthorInSpace`: whoever may write the steps may
 * order them, and a follower holding `member` fails both.
 */
export function canManageSpaceThreadStructure(
  space: Pick<SpaceRow, 'type' | 'userId' | 'orgId'> | null | undefined,
  role: SpaceRole,
  actorId: string,
): boolean {
  if (!space) return false;
  if (space.type === 'personal') return isActualSpaceOwner(space, actorId);
  return isActualSpaceOwner(space, actorId) || role === 'leader' || role === 'owner';
}
