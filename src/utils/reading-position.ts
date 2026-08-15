/**
 * Where reading left off, as stored on `UserMetadata.lastReadPosition`.
 *
 * Shared between server and client so the JSON blob has exactly one definition. It is a blob
 * rather than columns because it is a single value that is always read and written whole —
 * splitting it into four columns would buy nothing and cost a migration the next time the
 * bookmark learns to remember something else.
 */

export interface ReadingPosition {
  book: string;
  chapter: number;
  /** The verse in view when known — a bookmark is more useful than a chapter number. */
  verse?: number;
  translation?: string;
  /** ISO timestamp. */
  at: string;
}

/**
 * Parse a stored position, returning null for anything that isn't one.
 *
 * Total, because the column holds free-form JSON written by past and future versions of the
 * app: a blob that has drifted must read as "no bookmark", never as a crash on Home.
 */
export function parseReadingPosition(raw: string | null | undefined): ReadingPosition | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const { book, chapter, verse, translation, at } = parsed as Record<string, unknown>;
  if (typeof book !== 'string' || !book.trim()) return null;
  if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 1) return null;
  if (typeof at !== 'string' || !at) return null;

  return {
    book: book.trim(),
    chapter,
    verse:
      typeof verse === 'number' && Number.isInteger(verse) && verse > 0 ? verse : undefined,
    translation: typeof translation === 'string' && translation.trim() ? translation.trim() : undefined,
    at,
  };
}

export function serializeReadingPosition(position: ReadingPosition): string {
  return JSON.stringify(position);
}

/** "Genesis 1", "John 3:16" — how a position reads back to the person who left it. */
export function readingPositionReference(position: ReadingPosition): string {
  return position.verse
    ? `${position.book} ${position.chapter}:${position.verse}`
    : `${position.book} ${position.chapter}`;
}
