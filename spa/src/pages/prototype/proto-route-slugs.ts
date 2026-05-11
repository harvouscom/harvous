/** Slugs for `/prototype/space/:spaceId/n/:noteId` TanStack routes (`space_*` / `note_*` prefixes omitted in URL). */
export function noteParamSlug(id: string) {
  return id.startsWith('note_') ? id.slice('note_'.length) : id;
}

export function spaceParamSlug(id: string) {
  return id.startsWith('space_') ? id.slice('space_'.length) : id;
}

export function normalizeNoteIdFromParam(slug: string) {
  return slug.startsWith('note_') ? slug : `note_${slug}`;
}
