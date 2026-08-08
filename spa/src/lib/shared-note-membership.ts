/**
 * Which spaces a note is in, and which it can still be added to.
 *
 * Two directions use the same rules and must not drift apart:
 *  - space → notes ("add notes to this folder/thread", PrototypeAddNotesSheet)
 *  - note → spaces ("share this note to a space", PrototypeNoteMoreMenu)
 *
 * The first direction already got this right. The second never consulted the
 * note's existing associations at all, so it offered spaces the note was already
 * in and reported success for a server no-op. Both now resolve through
 * `planSharedAddNotesRequest`.
 */
import { canComposeInSpace } from './shared-space-capabilities';

export type AddNotesOriginScope = 'this-space' | 'my-home';

export interface AddNotesCandidate {
  id: string;
  title: string;
  noteType: string;
  updatedAt: string | null;
  createdAt: string | null;
  content: string | null;
  isOwnNote?: boolean;
  /** A locked note. Optional so a payload cached before this shipped still parses. */
  contentEncrypted?: boolean;
  isAssociatedWithTarget?: boolean;
  /** Tag names when known (local fuzzy search); API matches tags server-side. */
  tagNames?: string[];
}

/** Split My Home API results into This space vs My Home chip pools. */
export function filterCandidatesByOriginScope(
  notes: AddNotesCandidate[],
  origin: AddNotesOriginScope,
  options?: { ownNotesOnly?: boolean },
): AddNotesCandidate[] {
  const ownOnly = options?.ownNotesOnly === true;
  return notes.filter((note) => {
    if (ownOnly && note.isOwnNote === false) return false;
    if (origin === 'this-space') return note.isAssociatedWithTarget === true;
    return note.isAssociatedWithTarget !== true;
  });
}

export type SharedAddNotesRequestPlan =
  'organize-associated' | 'associate-then-organize' | 'save-copy-required' | 'forbidden';

/** Decide whether a shared-space candidate needs association, organization, or an explicit copy flow. */
export function planSharedAddNotesRequest(options: {
  isAlreadyAssociated: boolean;
  isOwnNote: boolean;
  isSpaceOwner: boolean;
}): SharedAddNotesRequestPlan {
  if (options.isAlreadyAssociated) {
    return options.isOwnNote || options.isSpaceOwner ? 'organize-associated' : 'forbidden';
  }
  return options.isOwnNote ? 'associate-then-organize' : 'save-copy-required';
}

/** Why a space can't receive this note. Drives the disabled row's explanation. */
export type NoteSpaceBlockedReason = 'not-author' | 'locked-note' | 'channel-read-only';

export interface NoteSpaceMembershipRow<TSpace> {
  space: TSpace;
  state: 'added' | 'addable' | 'blocked';
  reason?: NoteSpaceBlockedReason;
}

interface MembershipCandidateSpace {
  id: string;
  type?: string | null;
  orgId?: string | null;
}

function normalizeSpaceId(spaceId: string): string {
  const trimmed = spaceId.trim();
  return trimmed.startsWith('space_') ? trimmed : `space_${trimmed}`;
}

/**
 * Note → spaces. Classifies every candidate space as already-added, addable, or
 * blocked, so the menu can show the truth instead of offering a no-op.
 *
 * Mirrors the server's own refusals (`shared-space-lifecycle.ts`): a non-author
 * gets `SAVE_COPY_REQUIRED`, an encrypted note gets `LOCKED_NOTE`, and a ministry
 * channel refuses member-authored posts.
 */
export function resolveNoteSpaceMembershipRows<TSpace extends MembershipCandidateSpace>(input: {
  candidateSpaces: TSpace[];
  /** Ids from `note.spaces` — the note's live associations. */
  associatedSpaceIds: Iterable<string>;
  /** Space currently being read in; excluded from "Add to" (it has its own Remove item). */
  currentSharedSpaceId?: string | null;
  isOwnNote: boolean;
  contentEncrypted?: boolean;
  isSpaceOwnerById?: (spaceId: string) => boolean;
}): NoteSpaceMembershipRow<TSpace>[] {
  const associated = new Set<string>();
  for (const id of input.associatedSpaceIds) associated.add(normalizeSpaceId(id));
  const current = input.currentSharedSpaceId
    ? normalizeSpaceId(input.currentSharedSpaceId)
    : null;

  const rows: NoteSpaceMembershipRow<TSpace>[] = [];
  for (const space of input.candidateSpaces) {
    const id = normalizeSpaceId(space.id);
    if (id === current) continue;

    const isAlreadyAssociated = associated.has(id);
    if (isAlreadyAssociated) {
      rows.push({ space, state: 'added' });
      continue;
    }

    // An encrypted note can't be shared — the server rejects it outright.
    if (input.contentEncrypted) {
      rows.push({ space, state: 'blocked', reason: 'locked-note' });
      continue;
    }
    if (!canComposeInSpace({ type: space.type, orgId: space.orgId })) {
      rows.push({ space, state: 'blocked', reason: 'channel-read-only' });
      continue;
    }

    const plan = planSharedAddNotesRequest({
      isAlreadyAssociated: false,
      isOwnNote: input.isOwnNote,
      isSpaceOwner: input.isSpaceOwnerById?.(id) === true,
    });
    rows.push(
      plan === 'associate-then-organize'
        ? { space, state: 'addable' }
        : { space, state: 'blocked', reason: 'not-author' },
    );
  }
  return rows;
}

/** Copy for a disabled row's tooltip. */
export function noteSpaceBlockedReasonLabel(reason: NoteSpaceBlockedReason): string {
  switch (reason) {
    case 'locked-note':
      return 'Locked notes can’t be shared to a space';
    case 'channel-read-only':
      return 'Only church leaders can post to a channel';
    case 'not-author':
    default:
      return 'Save an attributed copy to share someone else’s note';
  }
}
