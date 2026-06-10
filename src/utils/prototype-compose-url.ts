/** Idle delay before replacing `/n/new` with `/n/<id>` while the user is still typing. */
export const COMPOSE_URL_IDLE_MS = 2000;

export type PendingComposeUrlReplace = {
  noteId: string;
  slug: string;
};

/** Toolbar note id: persisted compose id wins on draft route before URL catches up. */
export function resolvePrototypeToolbarNoteId(
  composePersistedNoteId: string | null,
  noteSlugFromPath: string | null,
  isDraftNoteRoute: boolean,
  normalizeNoteId: (slug: string) => string,
): string | null {
  if (composePersistedNoteId) return composePersistedNoteId;
  if (noteSlugFromPath && !isDraftNoteRoute) {
    return normalizeNoteId(noteSlugFromPath);
  }
  return null;
}

/** Skip destructive editor resets when draft route adopts a server note id mid-session. */
export function isPrototypeDraftPersistNoteIdSwap(
  prevNoteId: string | null | undefined,
  nextNoteId: string | null | undefined,
): boolean {
  return prevNoteId === 'note_draft' && nextNoteId != null && nextNoteId !== 'note_draft';
}
