/**
 * One line of verse text for a reference — the peek beside a scripture draft.
 *
 * Offline pack first: the default translation is warmed in the background, so for most
 * references the text is already on the device and the peek can appear the moment the draft
 * becomes valid, with no request. Then the session's verse cache, then the network.
 *
 * Never throws and never reports "not found": a peek that can't be had is simply not shown.
 */

import { parseScriptureReference } from './scripture-detector';
import { bibleVersesBookName } from './bible-verses-book-name';
import { fetchVerseHtml, getCachedVerseHtml } from './fetch-verse-html';

/** About one line beside the draft. Longer text is cut at a word with an ellipsis. */
export const VERSE_PEEK_MAX_CHARS = 140;

const peekCache = new Map<string, string>();

function peekKey(reference: string, translation: string): string {
  return `${reference.trim()}::${translation.trim()}`;
}

/** A peek already worked out this session, so retyping the same reference shows it at once. */
export function getCachedVersePeek(reference: string, translation: string): string | null {
  return peekCache.get(peekKey(reference, translation)) ?? null;
}

/** Collapse whitespace and cut at a word boundary near `max`, adding an ellipsis when cut. */
export function truncatePeek(text: string, max = VERSE_PEEK_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,;:.—–-]+$/, '')}…`;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

/** fetch-verse HTML → plain words: verse-number superscripts and headings dropped. */
export function verseHtmlToPeekText(html: string): string {
  return html
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
    // "CH 4" chapter chips between the chapters of a cross-chapter range.
    .replace(/<p class="passage-chapter-heading">[\s\S]*?<\/p>/gi, ' ')
    .replace(/<\/p>\s*<p\b/gi, ' <p')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, name: string) => ENTITIES[name] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

async function readFromPack(reference: string, translation: string): Promise<string | null> {
  const parsed = parseScriptureReference(reference);
  if (!parsed) return null;
  const [start, end] = Array.isArray(parsed.verse) ? parsed.verse : [parsed.verse, parsed.verse];
  // A cross-chapter range ("John 3:16-4:2") ends in another chapter; the peek only needs its
  // first verses, which all live in the start chapter.
  const crossesChapter = parsed.endChapter != null && parsed.endChapter !== parsed.chapter;

  try {
    // Dynamic, like the reader: the pack store pulls in Dexie, which the editor shouldn't load
    // just to type a sentence.
    const { readPackedChapter } = await import('./bible-pack-store');
    const verses = await readPackedChapter(translation, bibleVersesBookName(parsed.book), parsed.chapter);
    if (!verses || verses.length === 0) return null;
    const picked = verses.filter((v) => v.number >= start && (crossesChapter || v.number <= end));
    if (picked.length === 0) return null;
    return picked.map((v) => v.text).join(' ');
  } catch {
    return null;
  }
}

/**
 * The peek text for a reference in a translation, or null when there isn't one to show.
 * Results are kept for the session; failures are not, so a later attempt can still succeed.
 */
export async function getVersePeek(reference: string, translation: string): Promise<string | null> {
  const key = peekKey(reference, translation);
  const known = peekCache.get(key);
  if (known) return known;

  let text = await readFromPack(reference, translation);
  if (!text) {
    const html = getCachedVerseHtml(reference, translation) ?? (await fetchVerseHtml(reference, translation));
    // "This verse is not included in the … translation." comes back as italic HTML, not a 404.
    if (html && !/^\s*<p><em>/.test(html)) text = verseHtmlToPeekText(html);
  }
  if (!text) return null;

  const peek = truncatePeek(text);
  peekCache.set(key, peek);
  return peek;
}
