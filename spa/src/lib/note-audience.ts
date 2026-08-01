/**
 * A note's *audience* — which spaces it is published to, and what that means for
 * the surface currently rendering it.
 *
 * Background: a note is never copied into a shared space. The canonical row lives
 * in the author's My Home and each shared space is a `SpaceNotes` association. The
 * server mirrors "co-edit is on in at least one of those spaces" onto
 * `Notes.coEditEnabled`, which is what the write path, the realtime broadcast and
 * the offline-queue bypass all key off.
 *
 * That mirror is deliberately context-free, so rendering from it makes My Home
 * show co-editing chrome for a note nobody is touching. Everything here exists to
 * separate the two questions:
 *
 *   - "may this note be co-edited anywhere?"  → the mirror, for plumbing
 *   - "is it co-editable *here*?"             → per-association, for rendering
 *
 * Pure by design: no React, no queries. This is the one place the Home-vs-space
 * rules live, so they can be unit-tested as a matrix rather than discovered in UI.
 */

/** One live `SpaceNotes` association, as `GET /api/notes/:id/details` reports it. */
export interface NoteAudienceSpace {
  id: string;
  title: string;
  /** `'shared'` = collaborative space; `'public'` = ministry broadcast channel. */
  spaceType: string;
  coEditEnabled: boolean;
}

/** Loose shape of `note.spaces` before normalization. */
export interface NoteAudienceSpaceInput {
  id: string;
  title: string;
  spaceType?: string;
  coEditEnabled?: boolean;
}

export type NoteAudienceScope = 'home' | 'space' | 'unknown';

export interface NoteAudience {
  /**
   * `'unknown'` until associations have loaded. Callers must render nothing and
   * decide nothing on `'unknown'` — an absent array is not an empty audience.
   */
  scope: NoteAudienceScope;
  /** The association matching the active shared context, when there is one. */
  contextSpace: NoteAudienceSpace | null;
  /** Collaborative shared spaces (`type='shared'`). */
  sharedSpaces: NoteAudienceSpace[];
  /** Ministry broadcast channels (`type='public'`). */
  channels: NoteAudienceSpace[];
  /**
   * Per-space truth. `false` in Home — a note is never co-edited "in" My Home,
   * even when a shared space it belongs to has co-edit on.
   */
  coEditEnabledInContext: boolean;
  /**
   * The `Notes.coEditEnabled` mirror. Gates the presence lease and the
   * offline-queue bypass. **Never render from this** — that is the leak.
   */
  coEditEnabledAnywhere: boolean;
}

/** Prototype APIs use `space_*` ids; navigation and URLs may carry bare ones. */
function normalizeSpaceId(spaceId: string | null | undefined): string | null {
  const trimmed = spaceId?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('space_') ? trimmed : `space_${trimmed}`;
}

function normalizeAudienceSpace(space: NoteAudienceSpaceInput): NoteAudienceSpace | null {
  const id = normalizeSpaceId(space.id);
  if (!id) return null;
  return {
    id,
    title: space.title,
    // Associations only ever exist for shared/public spaces; default defensively
    // to the collaborative reading so a missing field can't silently create a
    // "channel" that skips co-edit UI.
    spaceType: space.spaceType ?? 'shared',
    coEditEnabled: space.coEditEnabled === true,
  };
}

export function resolveNoteAudience(input: {
  /** Active shared context (`?space=` ∩ the note's associations), or null for Home. */
  contextSpaceId: string | null | undefined;
  /** `note.spaces`. `undefined` means detail has not loaded — not "no spaces". */
  spaces: NoteAudienceSpaceInput[] | undefined;
  /** `note.coEditEnabled` — the OR-mirror. */
  noteCoEditEnabled: boolean | undefined;
}): NoteAudience {
  const coEditEnabledAnywhere = input.noteCoEditEnabled === true;
  const contextSpaceId = normalizeSpaceId(input.contextSpaceId);

  if (!input.spaces) {
    return {
      scope: 'unknown',
      contextSpace: null,
      sharedSpaces: [],
      channels: [],
      coEditEnabledInContext: false,
      coEditEnabledAnywhere,
    };
  }

  const spaces = input.spaces
    .map(normalizeAudienceSpace)
    .filter((space): space is NoteAudienceSpace => space !== null);

  const contextSpace = contextSpaceId
    ? (spaces.find((space) => space.id === contextSpaceId) ?? null)
    : null;

  return {
    scope: contextSpaceId ? 'space' : 'home',
    contextSpace,
    sharedSpaces: spaces.filter((space) => space.spaceType === 'shared'),
    channels: spaces.filter((space) => space.spaceType === 'public'),
    coEditEnabledInContext: contextSpace?.coEditEnabled === true,
    coEditEnabledAnywhere,
  };
}

/**
 * Whether this viewer's editor is locked because a *remote* holder has the pen.
 *
 * Lives here, next to the visibility rule, on purpose. These two answers must be
 * derived from the same inputs or they can disagree — and the one disagreement
 * that matters (locked editor, quiet bar) leaves the user staring at a read-only
 * note with no explanation. Keeping them in one module makes that pairing
 * testable instead of a convention two call sites have to remember.
 */
export function resolveCoEditFollower(input: {
  /** The `Notes.coEditEnabled` mirror — the lease is per-note, not per-space. */
  coEditEnabledAnywhere: boolean;
  isOnboardingReadonly: boolean;
  leaseActive: boolean;
  penHeldByOther: boolean;
  isOwnNote: boolean;
  canCoEdit: boolean;
}): boolean {
  return (
    input.coEditEnabledAnywhere &&
    !input.isOnboardingReadonly &&
    input.leaseActive &&
    input.penHeldByOther &&
    (input.isOwnNote || input.canCoEdit)
  );
}

/**
 * Whether a foreign (not-own) note must render read-only, independent of
 * whatever space context the viewer currently believes they're in.
 *
 * This is the safety check that sits underneath `noteInSharedSpace` context
 * resolution rather than behind it. A note we positively know belongs to
 * someone else, with no co-edit grant, must stay locked even if the space
 * context the viewer opened it in gets lost — e.g. the switcher moving to My
 * Home, or a stale/incomplete association list. `canEdit` is the server's own
 * verdict (`resolveNoteEditAuthorization`, the same helper the write endpoint
 * uses), so it is authoritative and must never be silently skipped.
 */
export function resolveForeignNoteReadOnly(input: {
  /** True only when reading inside one of the note's own live shared-space associations. */
  noteInSharedSpace: boolean;
  /** Tri-state: `null` while ownership is still resolving. Only explicit `false` locks. */
  isOwnNoteConfirmed: boolean | null;
  /** The server's verdict that this viewer may write the body. */
  canEdit: boolean;
  holdsPen: boolean;
  penFree: boolean;
}): boolean {
  if (input.isOwnNoteConfirmed === false && !input.canEdit) return true;
  if (!input.noteInSharedSpace) return false;
  if (input.isOwnNoteConfirmed === true) return false;
  if (!input.canEdit) return true;
  return !(input.holdsPen || input.penFree);
}

/**
 * How prominently the edit-status slot should render.
 *
 *  - `loud`   — the full pen/lease banner
 *  - `quiet`  — a subdued "Shared with …" line, no co-edit chrome
 *  - `hidden` — nothing (private note, or membership still unknown)
 */
export type NoteEditStatusVisibility = 'hidden' | 'quiet' | 'loud';

export function resolveNoteEditStatusVisibility(input: {
  scope: NoteAudienceScope;
  coEditEnabledInContext: boolean;
  isForeignSharedNote: boolean;
  /** Someone other than this viewer currently holds the pen. */
  penHeldByOther: boolean;
  /** This viewer's editor is locked because a remote holder has the pen. */
  isFollower: boolean;
  isHolding: boolean;
  sharedCount: number;
  channelCount: number;
}): NoteEditStatusVisibility {
  // Anti-clobber invariant: a live pen must always be visible, including in Home.
  // `isFollower` in particular means the editor has already gone non-editable —
  // going quiet there would leave a dead editor with no explanation on screen.
  if (
    input.isForeignSharedNote ||
    input.coEditEnabledInContext ||
    input.penHeldByOther ||
    input.isFollower ||
    input.isHolding
  ) {
    return 'loud';
  }
  if (input.scope === 'home' && input.sharedCount + input.channelCount > 0) return 'quiet';
  return 'hidden';
}

/**
 * Copy for the quiet Home affordance. Never counts in a shared context: a member
 * reading in one space must not learn the author's other audiences.
 */
export function noteAudienceLabel(input: {
  sharedCount: number;
  channelCount: number;
  firstSpaceTitle?: string | null;
}): string | null {
  const { sharedCount, channelCount } = input;
  if (sharedCount + channelCount === 0) return null;

  if (channelCount > 0 && sharedCount > 0) {
    return `Shared with ${plural(sharedCount, 'space')} · ${plural(channelCount, 'channel')}`;
  }
  if (channelCount > 0) return `Shared with ${plural(channelCount, 'channel')}`;

  const title = input.firstSpaceTitle?.trim();
  if (sharedCount === 1 && title) return `Shared with ${title}`;
  return `Shared with ${plural(sharedCount, 'space')}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Whether switching spaces should close the open note.
 *
 * The space switcher is navigation and outranks the open note: if a note is still
 * on screen, it belongs to the space you're in. This is an **event** rule, fired
 * on a user-initiated switch — not a render-time invariant. As a continuous guard
 * it would vanish a private note the moment you opened it from a My-Home-scoped
 * list inside a shared space.
 *
 * Fails open in every uncertain case. Closing a note that actually belonged is
 * indistinguishable from losing it.
 */
export function shouldCloseNoteOnSpaceSwitch(input: {
  /** Destination space, or null for My Home. */
  destinationSpaceId: string | null | undefined;
  homeSpaceId: string | null | undefined;
  /** `note.spaces[].id`. `undefined` = membership unknown; never close on unknown. */
  noteSpaceIds: string[] | undefined;
  isOwnNote: boolean;
  /** An unsaved draft retargets to the new space instead of closing. */
  isDraft: boolean;
}): boolean {
  if (input.isDraft) return false;
  if (!input.noteSpaceIds) return false;

  const home = normalizeSpaceId(input.homeSpaceId);
  const destination = normalizeSpaceId(input.destinationSpaceId);

  // My Home is an aggregate — every note you authored is in it regardless of
  // which shared spaces it's also published to, so your own note never closes.
  if (!destination || destination === home) return !input.isOwnNote;

  const associated = input.noteSpaceIds
    .map(normalizeSpaceId)
    .some((id) => id !== null && id === destination);
  return !associated;
}
