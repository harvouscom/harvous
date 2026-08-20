import type { QueryClient } from '@tanstack/react-query';
import { normalizePrototypeApiSpaceId } from '../utils/prototype-space-api-id';

/** React Query keys for prototype sidebar data derived from note content (scripture index, TSK connections). */
export function prototypeSpaceDerivedQueryKeys(spaceId: string) {
  const id = normalizePrototypeApiSpaceId(spaceId);
  if (!id) return [];
  return [
    ['prototype', 'space', id, 'scripture-index'] as const,
    ['prototype', 'space', id, 'scripture-connections'] as const,
  ];
}

/**
 * Reader data derived from notes, keyed by book/chapter rather than by space.
 *
 * The Bible reader's margin bars, highlights and saved word look-ups are all built from note
 * content, but they are addressed by passage — and a mutation has no idea which chapters the
 * note it just changed happens to touch. So these invalidate by prefix: broader than needed,
 * and still far cheaper than the alternative, which is what shipped. Nothing invalidated
 * `scripture-chapter-notes` at all, so editing or deleting a note while the reader was open
 * behind it left its margin bar sitting there until a refetch on window focus. With the
 * reader parked under a stacked note, "still open behind it" is the normal case.
 */
const PROTOTYPE_READER_DERIVED_KEY_PREFIXES = [
  ['prototype', 'scripture-chapter-notes'] as const,
  ['prototype', 'scripture-highlights'] as const,
  ['prototype', 'scripture-references'] as const,
];

export function invalidatePrototypeSpaceDerivedQueries(
  queryClient: QueryClient,
  spaceId: string | null | undefined,
): void {
  // The reader keys carry no space id, so they refresh whether or not one was resolved —
  // a note whose space could not be named still changed the chapter it points at.
  for (const queryKey of PROTOTYPE_READER_DERIVED_KEY_PREFIXES) {
    void queryClient.invalidateQueries({ queryKey });
  }
  if (!spaceId) return;
  for (const queryKey of prototypeSpaceDerivedQueryKeys(spaceId)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
