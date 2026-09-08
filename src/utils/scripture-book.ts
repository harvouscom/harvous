/**
 * The book a scripture reference belongs to, so close distractors can come from
 * the same neighbourhood rather than anywhere in the library.
 *
 * "John 3:16" and "John 1:1" are one book. "1 John 3:16" is another. A title with
 * no verse number is not a reference and does not group with anything.
 */
export function bookOfReference(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\s+\d+([:.].*)?$/, '').trim().toLowerCase();
}

/**
 * Split a pool into items that share a book with `anchors`, and the rest.
 *
 * `buildChoiceExercise` draws from `pool` before `fallbackPool`, so callers pass
 * `close` then `rest` and the wrong answers stay in the same neighbourhood
 * whenever the library is deep enough.
 */
export function partitionByBook(
  anchors: readonly string[],
  pool: readonly string[],
): { close: string[]; rest: string[] } {
  const books = new Set(anchors.map(bookOfReference).filter((book) => book.length > 0));
  const close: string[] = [];
  const rest: string[] = [];
  const seen = new Set<string>();
  for (const item of pool) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    (books.has(bookOfReference(item)) ? close : rest).push(item);
  }
  return { close, rest };
}
