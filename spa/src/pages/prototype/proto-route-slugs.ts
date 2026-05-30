/** Slugs for `/prototype/n/:noteId`; classic `/space/:spaceId` still passes full ids (`space_*` / `note_*`) where needed. */
export function noteParamSlug(id: string) {
  return id.startsWith('note_') ? id.slice('note_'.length) : id;
}

export function spaceParamSlug(id: string) {
  return id.startsWith('space_') ? id.slice('space_'.length) : id;
}

export function normalizeNoteIdFromParam(slug: string) {
  return slug.startsWith('note_') ? slug : `note_${slug}`;
}
