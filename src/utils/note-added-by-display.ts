/** Normalize server/local `addedBy` to a non-empty source id (defaults to user-created). */
export function normalizeNoteAddedBy(raw?: string | null): string {
  const trimmed = raw?.trim();
  return trimmed || 'user';
}

/** Inline metadata copy (classic NoteDetailsPanel — no separate field label). */
export function formatNoteAddedByLabel(raw?: string | null): string {
  return normalizeNoteAddedBy(raw) === 'harvous' ? 'Added by Harvous' : 'Added by you';
}

/** Source name only — use when the row label is already "Added by". */
export function formatNoteAddedBySource(raw?: string | null): string {
  return normalizeNoteAddedBy(raw) === 'harvous' ? 'Harvous' : 'You';
}
