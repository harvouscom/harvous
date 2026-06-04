/** Canonical `note_*` id for API path params (slug or legacy `note/` prefix). */
export function normalizeServerNoteId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith('note/')) return `note_${trimmed.slice(5)}`;
  if (trimmed.startsWith('note_')) return trimmed;
  return `note_${trimmed}`;
}
