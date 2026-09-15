import type { SmartJumpDestination } from './prototype-home-trends';

/** The last place the reader was, as a smart-jump destination. */
export type LastActivityRead = {
  book: string;
  chapter: number;
  translation?: string | null;
  verse?: number;
} | null;

/**
 * Resume exactly where reading stopped.
 *
 * The continue-reading card can still offer the next unread chapter. Opening the reader
 * from Home is not that card: it is returning to the surface, and the surface should be
 * where it was left — same book, chapter, verse, and translation.
 */
export function destinationFromLastActivity(
  lastRead: LastActivityRead,
): SmartJumpDestination | null {
  if (!lastRead?.book || !Number.isInteger(lastRead.chapter) || lastRead.chapter < 1) {
    return null;
  }
  const verse =
    typeof lastRead.verse === 'number' && Number.isInteger(lastRead.verse) && lastRead.verse >= 1
      ? lastRead.verse
      : null;
  return {
    book: lastRead.book,
    chapter: lastRead.chapter,
    verse,
    translation: lastRead.translation || null,
    source: 'continue',
  };
}
