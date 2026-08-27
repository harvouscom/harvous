/**
 * Which spaces a note is in, and which it can still be added to.
 *
 * Three surfaces use these rules and must not drift apart:
 *  - space → notes ("add notes to this folder/thread", PrototypeAddNotesSheet)
 *  - note → spaces (the destination row above the editor, PrototypeNoteDestinationSheet)
 *  - note → spaces (••• → "Save a copy" for someone else's note)
 *
 * The first direction always got this right. The second never consulted the note's
 * existing associations at all, so it offered spaces the note was already in and
 * reported success for a server no-op. It also ran two *different* copies of the rules —
 * a compose-time picker and a menu — that disagreed about church-owned spaces and about
 * who may post to a ministry channel. Everything resolves through
 * `resolveNoteDestinationRows` now, and through `planSharedAddNotesRequest` beneath it.
 */

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
  /** Present on `memberOfSpaces` entries only; absent on spaces the viewer owns. */
  role?: 'owner' | 'leader' | 'member' | null;
  ownerId?: string | null;
}

/**
 * The viewer's role in a candidate space.
 *
 * `NavSpace.role` is only populated for `memberOfSpaces`. A space the viewer *owns*
 * arrives from `nav.spaces` with no role at all, so a bare `role === 'owner'` test
 * reads an owned ministry channel as a follower and refuses to post to it. Fall back
 * to ownership by id.
 */
function resolveViewerRole(
  space: MembershipCandidateSpace,
  viewerUserId: string | null | undefined,
): 'owner' | 'leader' | 'member' {
  if (space.role) return space.role;
  return viewerUserId && space.ownerId === viewerUserId ? 'owner' : 'member';
}

/**
 * Mirror of the server's `canAuthorInSpace` (server/utils/space-access.ts).
 *
 * Deliberately not `canComposeInSpace`, which refuses a ministry channel to *everyone*.
 * That is right for "write a loose note in this room" but wrong here: the server accepts
 * a note into a channel from its owner or a leader, so blocking them client-side told a
 * channel's own leader that only leaders may post.
 */
export function canAuthorNoteInSpace(
  space: MembershipCandidateSpace,
  viewerUserId?: string | null,
): boolean {
  switch (space.type ?? 'personal') {
    case 'shared':
      return true;
    case 'public': {
      const role = resolveViewerRole(space, viewerUserId);
      return role === 'owner' || role === 'leader';
    }
    default:
      return false;
  }
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
  /** Resolves ownership for spaces that carry no explicit `role`. */
  viewerUserId?: string | null;
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
    if (!canAuthorNoteInSpace(space, input.viewerUserId)) {
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

/** One row in the note's destination menu. `spaceId: null` is My Home. */
export interface NoteDestinationRow<TSpace> {
  /** Null for the My Home row, which has no `SpaceNotes` association behind it. */
  space: TSpace | null;
  /** Normalized `space_*` id, or null for My Home. */
  spaceId: string | null;
  title: string;
  isHome: boolean;
  state: 'added' | 'addable' | 'blocked';
  reason?: NoteSpaceBlockedReason;
}

/**
 * Every place one note can live, My Home first.
 *
 * **My Home is always present and always `added`.** Not a default, and not something the
 * menu decides — a note's canonical row *is* its My Home row, and every shared space is a
 * `SpaceNotes` association on top of it (see `note-audience.ts`). There is no state in
 * which a note you authored is absent from your Home, so its row is ticked and inert.
 *
 * This is the single resolver behind both the compose-time and saved-note destination
 * menus. It replaced `draftDestinationOptions`, which had drifted from this one on three
 * points: it excluded church-owned spaces, disagreed about who may post to a channel, and
 * had no notion of a space the note was already in.
 */
export function resolveNoteDestinationRows<
  TSpace extends MembershipCandidateSpace & { title: string },
>(input: {
  /** `nav.spaces` and `nav.memberOfSpaces`, already deduped by the caller. */
  candidateSpaces: TSpace[];
  associatedSpaceIds: Iterable<string>;
  isOwnNote: boolean;
  contentEncrypted?: boolean;
  viewerUserId?: string | null;
  homeSpaceId?: string | null;
}): NoteDestinationRow<TSpace>[] {
  const home = input.homeSpaceId ? normalizeSpaceId(input.homeSpaceId) : null;
  const rows: NoteDestinationRow<TSpace>[] = [
    { space: null, spaceId: null, title: 'My Home', isHome: true, state: 'added' },
  ];

  const seen = new Set<string>();
  const candidates = input.candidateSpaces.filter((space) => {
    const id = normalizeSpaceId(space.id);
    // A personal space *is* My Home — already the first row, never a second one.
    if (id === home || (space.type ?? 'personal') === 'personal') return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  for (const row of resolveNoteSpaceMembershipRows({
    candidateSpaces: candidates,
    associatedSpaceIds: input.associatedSpaceIds,
    isOwnNote: input.isOwnNote,
    contentEncrypted: input.contentEncrypted,
    viewerUserId: input.viewerUserId,
  })) {
    rows.push({
      space: row.space,
      spaceId: normalizeSpaceId(row.space.id),
      title: row.space.title,
      isHome: false,
      state: row.state,
      reason: row.reason,
    });
  }
  return rows;
}

/**
 * What the destination row above the editor reads.
 *
 * Names rather than counts up to `maxNamed`, because "which spaces" is the question the
 * row exists to answer and a bare count sends you into the menu to find out.
 */
export function noteDestinationLabel(
  rows: readonly { title: string; isHome: boolean; state: string }[],
  options?: { maxNamed?: number },
): string {
  const maxNamed = options?.maxNamed ?? 2;
  const added = rows.filter((row) => row.state === 'added');
  const titles = added.map((row) => row.title);
  if (titles.length === 0) return 'In My Home';
  if (titles.length <= maxNamed) return `In ${titles.join(', ')}`;
  return `In ${titles.slice(0, maxNamed).join(', ')} + ${titles.length - maxNamed} more`;
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
