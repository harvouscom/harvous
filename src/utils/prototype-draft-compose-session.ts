import { decodeNoteSlug } from './ids';

export const PROTOTYPE_DRAFT_NOTE_ID = 'note_draft';

const PROTOTYPE_DRAFT_NOTE_SLUG = 'new';

function isPrototypeDraftNoteSlug(slug: string): boolean {
  return slug === PROTOTYPE_DRAFT_NOTE_SLUG;
}

/** `/new` → `/<slug>` within the same compose session (draft just persisted). */
export function isDraftComposeAdoptionTransition(
  prevSlug: string,
  nextSlug: string,
  adoptedComposeId: string | null,
): boolean {
  if (!isPrototypeDraftNoteSlug(prevSlug)) return false;
  if (!adoptedComposeId) return false;
  const nextId = decodeNoteSlug(nextSlug);
  return nextId === adoptedComposeId;
}

/** Stable editor mount key for one compose session (compose-on-home through first persist). */
export function prototypeComposeEditorKey(
  draftNoteId: string = PROTOTYPE_DRAFT_NOTE_ID,
  composeSessionEpoch: number,
): string {
  return `${draftNoteId}-${composeSessionEpoch}`;
}

/** True when the shell bumped composeSessionEpoch (user started a new compose). */
export function shouldResetComposeSessionOnEpochChange(prevEpoch: number, nextEpoch: number): boolean {
  return nextEpoch > prevEpoch;
}

/** Keep CardFullEditable mounted while the adopted note detail query is still loading. */
export function shouldKeepEditorDuringPersistedDraftLoad(
  isDraft: boolean,
  noteId: string,
  adoptedComposeId: string | null,
): boolean {
  return !isDraft && adoptedComposeId != null && adoptedComposeId === noteId;
}

/**
 * True while an adopted compose session still owns what's on screen — either we're still
 * on the draft route, or the URL is the note the draft persisted into.
 *
 * Anything keyed on the compose session (the editor mount key, the draft inspector
 * fallback) MUST gate on this rather than on `adoptedComposeId` alone. The id only clears
 * once the adopted note's query resolves, so navigating away first — or that query 404ing
 * — would otherwise leave it set and pin the editor to one mount for every later note.
 */
export function isAdoptedComposeSessionActive(
  isDraft: boolean,
  noteId: string,
  adoptedComposeId: string | null,
): boolean {
  if (adoptedComposeId == null) return false;
  return isDraft || adoptedComposeId === noteId;
}
