/**
 * Scripture short links: `harvo.us/john3.16` → `/read/john/3?v=16`.
 *
 * Kept apart from short-links.ts because this pulls in the reference parser and its chapter
 * data (~250 KB raw). Only the harvo.us Worker imports it.
 *
 * The parser (`parseScriptureReference`) reads the written form, `John 3:16`. A URL segment is
 * written for thumbs and slides instead, `john3.16`, `1cor13`, `song-of-solomon2`, so
 * `normalizeReferenceSegment` turns one into the other first.
 */

import { parseScriptureReference } from '@/utils/scripture-detector';
import { bookSlug } from '@/utils/bible-book-chapters';

/** Longer than any real reference; a bound on what the parser is ever handed. */
const MAX_SEGMENT_LENGTH = 40;

/**
 * A URL path segment as a written reference, or null when it can't be one.
 *
 * - separators next to a letter become spaces (`song-of-solomon` → `song of solomon`,
 *   `1-corinthians-13` → `1 corinthians 13`), while a `-` between digits stays a range
 *   (`8.28-39`)
 * - a leading book number gets its space (`1cor` → `1 cor`)
 * - a letter followed by a digit gets a space (`john3` → `john 3`)
 * - a `.` between digits is the chapter:verse colon (`3.16` → `3:16`)
 */
export function normalizeReferenceSegment(raw: string): string | null {
  let s: string;
  try {
    s = decodeURIComponent(raw);
  } catch {
    return null;
  }
  s = s.toLowerCase().trim();
  if (!s || s.length > MAX_SEGMENT_LENGTH) return null;
  s = s.replace(/(?<=[a-z])[-_+]+|[-_+]+(?=[a-z])/g, ' ');
  s = s.replace(/^([1-3])\s*(?=[a-z])/, '$1 ');
  s = s.replace(/([a-z])(\d)/g, '$1 $2');
  s = s.replace(/(\d)\.(\d)/g, '$1:$2');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * The reader path for a short-link segment, e.g. `/read/john/3?v=16`, or null when the
 * segment names no real passage (`mark`, `john99`, `hmc`).
 *
 * Same v/vEnd rules as `readerRouteForReference()` in spa/src/utils/reader-nav.ts, which
 * can't be imported here because it pulls in the router helpers: a chapter alone opens the
 * chapter, and `vEnd` is only set for a real range.
 */
export function scriptureReadPathFor(segment: string): string | null {
  const reference = normalizeReferenceSegment(segment);
  if (!reference) return null;
  const parsed = parseScriptureReference(reference);
  if (!parsed?.book || !parsed.chapter) return null;

  const namesAVerse = reference.includes(':');
  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : parsed.verse;

  const params = new URLSearchParams();
  if (namesAVerse && verseStart) params.set('v', String(verseStart));
  if (namesAVerse && verseEnd && verseEnd !== verseStart) params.set('vEnd', String(verseEnd));
  const query = params.toString();
  return `/read/${bookSlug(parsed.book)}/${parsed.chapter}${query ? `?${query}` : ''}`;
}
