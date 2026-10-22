/**
 * Where a query's words fall in a piece of text — for marking them in a search result.
 *
 * The verse search gets its marks from the server (`verse-search-snippet.ts`). Library results
 * do not: note search is fuzzy on the client and full-text on the server, and neither says where
 * the word was. So this finds them again, literally — each query word, case-insensitive. A row
 * that matched only fuzzily ("abid" for "abide") finds nothing here and simply draws unmarked,
 * which is the honest answer: there is no exact place to point at.
 *
 * Returns the same `VerseSnippetPart` runs as the verse snippet, so one renderer draws both.
 */
import type { VerseSnippetPart } from './verse-search-snippet';

/** A word shorter than this marks too much ("a", "of") to point at anything. */
const MIN_TOKEN_LENGTH = 2;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The query's words as one case-insensitive pattern, longest first so "abide" wins over "a"
 * where both would start at the same place. Null when nothing is long enough to mark.
 */
export function queryMatchPattern(query: string): RegExp | null {
  const tokens = Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((token) => token.toLowerCase())
        .filter((token) => token.length >= MIN_TOKEN_LENGTH),
    ),
  ).sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return null;
  return new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
}

/** Pure: `text` as runs of plain and matched text, in order, empty runs dropped. */
export function splitQueryMatches(text: string, query: string): VerseSnippetPart[] {
  if (!text) return [];
  const pattern = queryMatchPattern(query);
  if (!pattern) return [{ text, match: false }];
  const parts: VerseSnippetPart[] = [];
  let last = 0;
  for (const found of text.matchAll(pattern)) {
    const start = found.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: found[0], match: true });
    last = start + found[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

/** Characters kept ahead of the first match, so the word arrives with a little of its sentence. */
const LEAD_CONTEXT = 32;

/**
 * A window of `text` around the first literal match, with ellipses where it was cut.
 *
 * Null when no query word appears — the caller keeps whatever preview it had. A note's list
 * preview is its first line, which is exactly the part least likely to hold the word you
 * searched for; this is what lets the row show *why* it is here.
 */
export function excerptAroundMatch(text: string, query: string, max = 140): string | null {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const pattern = queryMatchPattern(query);
  if (!pattern) return null;
  const found = pattern.exec(flat);
  if (!found) return null;
  const at = found.index;
  if (at <= LEAD_CONTEXT && flat.length <= max) return flat;
  let start = Math.max(0, at - LEAD_CONTEXT);
  /* Start on a word, not halfway through one. */
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    if (space >= 0 && space < at) start = space + 1;
  }
  const end = Math.min(flat.length, start + max);
  const body = flat.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${body}${end < flat.length ? '…' : ''}`;
}
