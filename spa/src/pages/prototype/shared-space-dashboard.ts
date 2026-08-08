import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { StudyThreadCluster } from '../../hooks/queries/usePrototypeStudyThreads';
import type { ScriptureIndexBook } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import {
  derivePassageConnections,
  pickContinueNote,
  pickSpotlightThread,
  type HomePassageConnection,
  type HomePassageConnectionInput,
  type HomeTopThread,
} from '@/utils/prototype-home-trends';

export const SHARED_SPACE_NOTE_CARD_MAX = 3;
export const SHARED_SPACE_PASSAGE_CONNECTION_MIN = 2;

export type SharedSpaceNoteCardKind = 'new-from-others' | 'continue' | 'recent';

export interface SharedSpaceNoteCardSlot {
  note: SpaceNoteRow;
  eyebrow: string;
  kind: SharedSpaceNoteCardKind;
}

export interface ContributorIntroParts {
  otherDisplayName?: string;
  ownCount: number;
  otherCount: number;
}

export interface SharedSpaceIntroContributor {
  userId?: string;
  displayName: string;
  noteCount: number;
}

export interface SharedSpaceSocialIntro {
  otherContributors: SharedSpaceIntroContributor[];
  ownRecentCount: number;
  totalNoteCount: number;
  hasMoreNotes: boolean;
}

export function isNoteUnseenSinceVisit(
  note: SpaceNoteRow,
  unseenSince: string | null | undefined,
): boolean {
  if (!unseenSince) return false;
  const updated = note.lastUpdated ?? note.updatedAt;
  if (!updated) return false;
  // Compare as instants, not strings. A lexicographic string compare only
  // agrees with real chronological order when both sides share byte-identical
  // ISO formatting (same fractional-second precision, same UTC suffix) — the
  // server does a real Postgres timestamp compare instead
  // (`gt(Notes.updatedAt, sinceIso)` in server/utils/shared-space-visit.ts).
  // Date.parse mirrors that here so client/server agree even if formatting drifts.
  const updatedMs = Date.parse(updated);
  const sinceMs = Date.parse(unseenSince);
  if (Number.isNaN(updatedMs) || Number.isNaN(sinceMs)) return false;
  return updatedMs > sinceMs;
}

function isOwnSpaceNote(note: SpaceNoteRow, authUserId: string | null | undefined): boolean {
  return note.isOwnNote ?? (note.authorUserId != null && note.authorUserId === authUserId);
}

export function selectTopSharedPassage(books: ScriptureIndexBook[]): HomePassageConnection | undefined {
  const passages: HomePassageConnectionInput[] = [];
  for (const book of books) {
    for (const passage of book.passages) {
      if (!passage.notes.length) continue;
      passages.push({
        passageKey: passage.passageKey,
        displayRef: passage.displayRef,
        bookOrder: passage.bookOrder,
        chapter: passage.chapter,
        verseStart: passage.verseStart,
        notes: passage.notes,
      });
    }
  }
  const top = derivePassageConnections(passages, { limit: 1 })[0];
  return top && top.noteCount >= SHARED_SPACE_PASSAGE_CONNECTION_MIN ? top : undefined;
}

export function selectSpotlightThreadForSpace(threads: StudyThreadCluster[]): HomeTopThread | undefined {
  const mapped = threads.map((thread) => ({
    id: thread.id,
    title: thread.title,
    suggestedTitle: thread.suggestedTitle,
    hasCustomTitle: thread.hasCustomTitle,
    noteCount: thread.noteCount,
    updatedAt: thread.updatedAt,
  }));
  return pickSpotlightThread(mapped);
}

export function buildContributorIntro(
  recentNotes: SpaceNoteRow[],
  authUserId: string | null | undefined,
): ContributorIntroParts | null {
  const intro = buildSharedSpaceSocialIntro({
    sampleNotes: recentNotes,
    authUserId,
    totalNoteCount: recentNotes.length,
    hasMoreNotes: false,
  });
  if (!intro) return null;
  const firstOther = intro.otherContributors[0];
  if (intro.otherContributors.length === 0 && intro.ownRecentCount < 2) return null;
  return {
    otherDisplayName: firstOther?.displayName,
    ownCount: intro.ownRecentCount,
    otherCount: intro.otherContributors.reduce((sum, c) => sum + c.noteCount, 0),
  };
}

/** Social intro facts for a Home-style greeting with inline chips. */
export function buildSharedSpaceSocialIntro(input: {
  sampleNotes: SpaceNoteRow[];
  authUserId: string | null | undefined;
  totalNoteCount: number;
  hasMoreNotes: boolean;
}): SharedSpaceSocialIntro | null {
  const { sampleNotes, authUserId, totalNoteCount, hasMoreNotes } = input;
  if (totalNoteCount === 0) return null;

  const byOther = new Map<string, SharedSpaceIntroContributor>();
  let ownRecentCount = 0;

  for (const row of sampleNotes) {
    if (isOwnSpaceNote(row, authUserId)) {
      ownRecentCount += 1;
      continue;
    }
    /**
     * A row with no author at all is not evidence of a person — it is a row we failed to
     * attribute. Skip it rather than inventing a contributor.
     *
     * It used to fall back to the key `'other'` and the name "Someone", which collapsed
     * every unattributed row into one phantom collaborator with an inflated count. The
     * rows were ours: cache writers that omitted the author fields (see
     * `noteRowFromCreateResponse`). Those are fixed, and this is the guard that stops the
     * next such gap from becoming a person in the greeting.
     */
    if (!row.authorUserId && !row.authorDisplayName) continue;

    const key = row.authorUserId ?? row.authorDisplayName!;
    const displayName = row.authorDisplayName ?? 'A member';
    const existing = byOther.get(key);
    if (existing) {
      existing.noteCount += 1;
    } else {
      byOther.set(key, { userId: row.authorUserId, displayName, noteCount: 1 });
    }
  }

  const otherContributors = [...byOther.values()].sort(
    (a, b) => b.noteCount - a.noteCount || a.displayName.localeCompare(b.displayName),
  );

  if (otherContributors.length === 0 && ownRecentCount < 2 && totalNoteCount <= 1) {
    return null;
  }

  return {
    otherContributors,
    ownRecentCount,
    totalNoteCount,
    hasMoreNotes,
  };
}

export function formatSharedSpaceActivityWho(
  contributors: Array<{ displayName: string; noteCount: number }> | undefined,
): string | null {
  if (!contributors?.length) return null;
  const [first, second] = contributors;
  if (contributors.length === 1) {
    return `${first.displayName} added ${first.noteCount === 1 ? 'a note' : `${first.noteCount} notes`}`;
  }
  if (contributors.length === 2) {
    return `${first.displayName} and ${second.displayName} added notes`;
  }
  return `${first.displayName}, ${second.displayName}, and others added notes`;
}

export function buildSharedSpaceNoteCardSlots(input: {
  recentNotes: SpaceNoteRow[];
  notesForContinue: SpaceNoteRow[];
  unseenSince: string | null;
  authUserId: string | null | undefined;
  activeNoteId?: string;
}): SharedSpaceNoteCardSlot[] {
  const { recentNotes, notesForContinue, unseenSince, authUserId, activeNoteId } = input;
  const used = new Set<string>();
  const slots: SharedSpaceNoteCardSlot[] = [];

  const isUnseenFromOther = (note: SpaceNoteRow) =>
    !isOwnSpaceNote(note, authUserId) && isNoteUnseenSinceVisit(note, unseenSince);

  for (const note of recentNotes) {
    if (slots.length >= SHARED_SPACE_NOTE_CARD_MAX) break;
    if (!isUnseenFromOther(note) || used.has(note.id)) continue;
    used.add(note.id);
    slots.push({
      note,
      // "Updated," not "New" — isUnseenFromOther compares Notes.updatedAt against
      // the visit watermark, so an edit to an old note lands here too, not just
      // creates. See SHARED_SPACES_FRESHNESS_FOLLOWUPS.md §2.
      eyebrow: 'Updated since your last visit',
      kind: 'new-from-others',
    });
  }

  const continueNote = pickContinueNote(notesForContinue, { excludeIds: used });
  if (
    continueNote &&
    slots.length < SHARED_SPACE_NOTE_CARD_MAX &&
    !used.has(continueNote.id) &&
    isOwnSpaceNote(continueNote, authUserId) &&
    continueNote.id !== activeNoteId
  ) {
    used.add(continueNote.id);
    slots.push({
      note: continueNote,
      eyebrow: 'Pick up where you left off',
      kind: 'continue',
    });
  }

  for (const note of recentNotes) {
    if (slots.length >= SHARED_SPACE_NOTE_CARD_MAX) break;
    if (used.has(note.id)) continue;
    used.add(note.id);
    slots.push({
      note,
      eyebrow: isUnseenFromOther(note) ? 'Updated since your last visit' : 'Recently updated',
      kind: 'recent',
    });
  }

  return slots;
}

export interface SharedSpaceNoteCardGroup {
  eyebrow: string;
  slots: SharedSpaceNoteCardSlot[];
}

/** Consecutive cards with the same eyebrow — multi-card groups use a carousel in the UI. */
export function groupSharedSpaceNoteCardSlots(slots: SharedSpaceNoteCardSlot[]): SharedSpaceNoteCardGroup[] {
  const groups: SharedSpaceNoteCardGroup[] = [];
  for (const slot of slots) {
    const prev = groups[groups.length - 1];
    if (prev && prev.eyebrow === slot.eyebrow) {
      prev.slots.push(slot);
    } else {
      groups.push({ eyebrow: slot.eyebrow, slots: [slot] });
    }
  }
  return groups;
}

/** Header people row — solo owner space vs multi-member. */
export function sharedSpacePeopleHeaderLabel(peopleCount: number): string {
  if (peopleCount === 1) return 'Just you';
  return `${peopleCount} people`;
}

/** Sidebar thread card preview line — zero notes uses empty-state copy, not "0 notes". */
export function sharedThreadNoteCountPreview(noteCount: number): string {
  if (noteCount <= 0) return 'No notes yet';
  return `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`;
}

export const SHARED_THREAD_DRILLDOWN_ADD_EXISTING_LABEL = 'Add existing';
export const SHARED_THREAD_DRILLDOWN_COMPOSE_LABEL = 'Compose';
