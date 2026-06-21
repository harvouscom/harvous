import { decodeNoteSlug, encodeNoteSlug } from '@/utils/ids';

/** Slug for in-progress compose — no server note until the user adds title or body. */
export const PROTOTYPE_DRAFT_NOTE_SLUG = 'new';

export function isPrototypeDraftNoteSlug(slug: string): boolean {
  return slug === PROTOTYPE_DRAFT_NOTE_SLUG;
}

/**
 * URL slug for a note: a short base62 encoding of the `note_<timestamp>` id
 * (see encodeNoteSlug). Classic `/space/:spaceId` still passes full ids elsewhere.
 */
export function noteParamSlug(id: string) {
  return encodeNoteSlug(id);
}

export function spaceParamSlug(id: string) {
  return id.startsWith('space_') ? id.slice('space_'.length) : id;
}

export function normalizeNoteIdFromParam(slug: string) {
  return decodeNoteSlug(slug);
}
