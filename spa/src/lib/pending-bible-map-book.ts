/**
 * Bridge "open My Bible at this book" across the expand that follows.
 *
 * The reader's title line and the foot of a chapter hand off to the expanded map, which mounts
 * after `openExpandedSidebar('bible-map')` — so the opener cannot scroll it directly. Same shape
 * and same reason as `pending-discover-kind.ts`: a one-shot flag the destination reads itself,
 * rather than widening the shell's `openExpandedSidebar(tool)` with an argument one tool reads.
 *
 * Consumed once, so a later open from Home starts at the top rather than at a stale book.
 */
const PENDING_BIBLE_MAP_BOOK_KEY = 'harvous_pending_bible_map_book';

export function markPendingBibleMapBook(book: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_BIBLE_MAP_BOOK_KEY, book);
  } catch {
    /* Private mode, or a full quota. The map still opens, just at Genesis. */
  }
}

/** The pending book, exactly once. Null when there is none. */
export function consumePendingBibleMapBook(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_BIBLE_MAP_BOOK_KEY);
    if (raw) sessionStorage.removeItem(PENDING_BIBLE_MAP_BOOK_KEY);
    return raw || null;
  } catch {
    return null;
  }
}
