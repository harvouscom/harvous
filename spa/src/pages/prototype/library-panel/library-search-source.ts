/**
 * "My Harvous or the Bible" — the switch the Library panel's results gain once a query
 * searches verse text too.
 *
 * Two questions, not one list. "Find what I wrote" and "find where the Bible says this" were
 * one stream with the verses appended last, and on a phone the keyboard covers the bottom
 * half of the panel — so the verses were always below the fold, behind ten rows of your own
 * that only loosely matched. The switch puts both answers at the top, each with its count, so
 * the one you are not looking at still says it found something.
 *
 * Pure, so the rules are testable without rendering the panel.
 */
import type { SidebarSearchResult } from '../sidebar-search-types';

export type LibrarySearchSource = 'mine' | 'bible';

/** Lowercased words worth matching on; one-letter words match nearly anything. */
function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 2);
}

/**
 * Whether a row actually contains what was typed, rather than resembling it.
 *
 * The local matchers are Fuse at threshold 0.4, which is generous on purpose — it forgives a
 * typo in a folder name. It also matches "shepherd" against "Worship" and a highlight that
 * happens to share most of its letters. Those rows still belong in the list; they should not
 * outrank an exact hit, or decide that your study answered the question.
 *
 * Strong: every word appears in the row's text, or the server's full-text search returned the
 * note (it matched the word somewhere in the body, past what a preview shows). The passage row
 * a reference query hoists is a destination, and always strong.
 */
export function isStrongLibraryMatch(
  result: SidebarSearchResult,
  query: string,
  ftsNoteIds: ReadonlySet<string>,
): boolean {
  if (result.kind === 'scriptureReference') return true;
  if (result.kind === 'note' && result.noteId && ftsNoteIds.has(result.noteId)) return true;
  const words = queryWords(query);
  if (words.length === 0) return true;
  const haystack = [result.title, result.subtitle, result.ftsExcerpt]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Strong matches first, each half keeping the order it came in. */
export function strongMatchesFirst(
  results: readonly SidebarSearchResult[],
  query: string,
  ftsNoteIds: ReadonlySet<string>,
): SidebarSearchResult[] {
  const strong: SidebarSearchResult[] = [];
  const weak: SidebarSearchResult[] = [];
  for (const result of results) {
    (isStrongLibraryMatch(result, query, ftsNoteIds) ? strong : weak).push(result);
  }
  return weak.length === 0 ? [...results] : [...strong, ...weak];
}

/**
 * Which side opens when you have not picked one.
 *
 * Your own study first — it is what the panel is for — unless none of it really matches and
 * the Bible does. Loose matches alone do not hold the switch on My Harvous.
 */
export function defaultLibrarySearchSource({
  strongMineCount,
  verseCount,
}: {
  strongMineCount: number;
  verseCount: number;
}): LibrarySearchSource {
  return strongMineCount === 0 && verseCount > 0 ? 'bible' : 'mine';
}

/**
 * A segment's label with its count — the count is what makes the other side discoverable.
 * Omitted while that side is still loading, so it never reports a stale number.
 */
export function librarySourceLabel(
  name: string,
  count: number | null,
  hasMore = false,
): string {
  if (count === null) return name;
  return `${name} · ${count}${hasMore ? '+' : ''}`;
}
