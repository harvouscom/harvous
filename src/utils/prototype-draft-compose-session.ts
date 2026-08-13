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

/**
 * Whether starting a compose session should first drop any stored `note_draft`.
 *
 * The compose draft key is a single constant shared by every compose session, and the
 * editor's restore runs in a layout effect on the new mount — which React commits
 * *before* any passive effect in the parent that would clear it. So a stale draft left by
 * an earlier compose in this page session gets restored into the new, blank one. Clearing
 * synchronously at the moment the session begins is the only ordering that reliably wins.
 *
 * Epoch 0 → 1 is exempt: that is the first compose since the page loaded, so a stored
 * draft can only have come from a previous tab or a crash — the case the backstop exists
 * for. Every later epoch means the previous compose was live in *this* session, so its
 * content was either persisted to the server or deliberately abandoned.
 */
export function shouldClearStaleComposeDraftOnSessionStart(prevEpoch: number): boolean {
  return prevEpoch >= 1;
}

/**
 * The seed a compose session opens with, or null once its session is over.
 *
 * A seed is what the affordance that started compose already knew the note should say — a
 * daily passage, a sermon starter. It is stamped with the epoch it was created for and only
 * readable while that epoch is current.
 *
 * The epoch stamp is the entire safety mechanism, and it is not optional. Seeds cannot go
 * through the note-draft store: that key is shared by every compose session, and restoring a
 * leftover draft into the next one is exactly what put a finished note back on screen in an
 * unrelated space (see `shouldClearStaleComposeDraftOnSessionStart`). Without the epoch check
 * a seed would reproduce that bug precisely — tap "add today's passage", back out without
 * saving, start any new note, and the passage would be sitting in it.
 */
export function resolveComposeSeed<T>(
  stamped: { seed: T; epoch: number } | null | undefined,
  currentEpoch: number,
): T | null {
  if (!stamped) return null;
  return stamped.epoch === currentEpoch ? stamped.seed : null;
}

/**
 * Which draft key the editor should write to right now.
 *
 * Compose stays on the `note_draft` id until the URL idle-replaces to `/{id}`, so without
 * this every keystroke *after* the note was created kept re-writing `note_draft` with
 * content that was already on the server — stranding a draft that later restored itself
 * into an unrelated compose. Once the compose has persisted, drafts belong to the real
 * note, where the confirmed-save clear can reach them.
 */
export function resolveNoteDraftWriteKey(
  noteId: string | null | undefined,
  composePersistedNoteId: string | null | undefined,
): string | null {
  if (!noteId) return null;
  if (noteId === PROTOTYPE_DRAFT_NOTE_ID && composePersistedNoteId) return composePersistedNoteId;
  return noteId;
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
