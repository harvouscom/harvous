/**
 * The partition the panel's Scripture tab narrows by.
 *
 * Testament comes off `CANON_BOOK_GROUPS`, the same table Admin Pulse and the memory layer
 * read — a genuine either/or over data that already exists, which is the bar for putting a
 * switch above a list.
 *
 * Three segments, deliberately. The thumb divides the track by the number of segments, so
 * every one added is width taken from the rest, and the canon table's ten *groups* (Law,
 * Gospels, Paul's letters…) would be a filter you cannot read on a phone. Testament is the
 * cut that survives the width.
 *
 * Resources are not here: that tab already had a partition — which shelf an item came from —
 * and a second filter row above it would be two questions where the reader has one.
 */
import { canonGroupForBookOrder } from '@/utils/admin-pulse-canon-groups';
import type { LibrarySegmentedOption } from './PrototypeLibrarySegmented';

export type ScriptureTestamentFilter = 'all' | 'ot' | 'nt';

export const SCRIPTURE_TESTAMENT_OPTIONS: readonly LibrarySegmentedOption<ScriptureTestamentFilter>[] =
  [
    { id: 'all', label: 'All' },
    { id: 'ot', label: 'Old Testament' },
    { id: 'nt', label: 'New Testament' },
  ];

/**
 * **Two book-order conventions live in this codebase, and they differ by one.**
 *
 * `ScriptureIndexBook.bookOrder` comes from `canonicalBookOrderMap()`, which counts from
 * **0** — Genesis is 0. `CANON_BOOK_GROUPS` and `canonicalBookOrder()` in scripture-osis
 * both count from **1**, the Protestant 1–66. Handing one to the other does not fail; it
 * quietly answers for the neighbouring book, which is how a first pass here put Matthew in
 * the Old Testament and dropped Genesis out of both halves. The `+ 1` is that conversion,
 * and it is the only place this module touches the canon table.
 *
 * A book with no place in the table stays visible under "All" and falls out of both halves —
 * better a book you can still reach than one silently dropped by a lookup miss.
 */
export function scriptureTestamentMatches(
  filter: ScriptureTestamentFilter,
  bookOrder: number,
): boolean {
  if (filter === 'all') return true;
  return canonGroupForBookOrder(bookOrder + 1)?.testament === filter;
}
