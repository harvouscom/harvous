// Scripture Detection Utility
// Detects both scripture references and actual Bible verse text

import { BIBLE_STUDY_KEYWORDS } from './bible-study-keywords';
// @ts-ignore - JSON import with resolveJsonModule
import bibleChaptersData from '../data/bible-chapters.json';
import { TRANSLATION_ORDER } from '../data/translations';

/**
 * Regex alternation for inline translation suffix — NASB 1995 before NASB; then longest ids first
 * (e.g. NKJV before KJV) so alternation matches correctly.
 */
function buildInlineTranslationAlternation(): string {
  const sorted = [...TRANSLATION_ORDER].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const ids = sorted.map((id) => `(?:${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`);
  return ['(?:NASB\\s+1995)', ...ids].join('|');
}

const INLINE_TRANSLATION_ALT = buildInlineTranslationAlternation();

/**
 * Normalize a matched inline translation token to the canonical id stored on pills / API.
 * e.g. "NASB 1995", "nasb  1995" → "NASB"
 */
export function normalizeInlineTranslationAbbreviation(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (/^NASB\s+1995$/i.test(t)) return 'NASB';
  return t.toUpperCase();
}

/**
 * Match optional leading whitespace + translation abbreviation when `text` is only that
 * (e.g. text typed after a scripture pill). Returns canonical id and full consumed string for deletion.
 */
export function matchTrailingTranslationAbbreviation(text: string): { canonicalId: string; consumed: string } | null {
  const re = new RegExp(`^\\s*(${INLINE_TRANSLATION_ALT})\\s*$`, 'i');
  const m = text.match(re);
  if (!m) return null;
  return { canonicalId: normalizeInlineTranslationAbbreviation(m[1]), consumed: m[0] };
}

/** Translation codes longest-first for anchored suffix matching (NKJV before KJV). */
const ANCHORED_TRANSLATION_CODES = (() => {
  const sorted = [...TRANSLATION_ORDER].sort((a, b) => b.length - a.length || a.localeCompare(b));
  return ['NASB 1995', ...sorted];
})();

/**
 * Match optional leading whitespace + translation abbreviation at the start of `text`,
 * even when more prose follows (native `scriptureTrailingTranslationAfterReference` parity).
 * Requires no letter immediately after the matched code.
 */
export function matchAnchoredTrailingTranslationAbbreviation(
  text: string,
): { canonicalId: string; consumed: string } | null {
  const wsMatch = text.match(/^(\s*)/);
  const leadingWs = wsMatch ? wsMatch[1] : '';
  const tail = text.slice(leadingWs.length);
  if (!tail) return null;

  for (const code of ANCHORED_TRANSLATION_CODES) {
    const pattern =
      code === 'NASB 1995'
        ? /^NASB\s+1995/i
        : new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const m = tail.match(pattern);
    if (!m) continue;
    const matched = m[0];
    const idxAfter = matched.length;
    if (idxAfter < tail.length && /[a-zA-Z]/.test(tail[idxAfter]!)) continue;
    return {
      canonicalId: normalizeInlineTranslationAbbreviation(matched),
      consumed: leadingWs + matched,
    };
  }
  return null;
}

const DEBUG = false;

// Bible chapter/verse data structure
interface BibleChapter {
  book: string;
  bookOrder: number;
  testament: 'old' | 'new';
  chapter: number;
  startVerse: number;
  endVerse: number;
}

// Bible chapter/verse data from https://gist.github.com/izakfilmalter/cdc1c9acb82b6ef94aedcf22c00d998f
// Build lookup map: Map<bookName, Map<chapter, { startVerse, endVerse }>>
let BIBLE_CHAPTERS_MAP: Map<string, Map<number, { startVerse: number; endVerse: number }>> | null = null;

function buildBibleChaptersMap(): Map<string, Map<number, { startVerse: number; endVerse: number }>> {
  if (BIBLE_CHAPTERS_MAP) {
    return BIBLE_CHAPTERS_MAP;
  }

  const map = new Map<string, Map<number, { startVerse: number; endVerse: number }>>();
  const data = bibleChaptersData as BibleChapter[];

  for (const chapter of data) {
    const bookName = chapter.book;
    if (!map.has(bookName)) {
      map.set(bookName, new Map());
    }
    const bookMap = map.get(bookName)!;
    bookMap.set(chapter.chapter, {
      startVerse: chapter.startVerse,
      endVerse: chapter.endVerse
    });
  }

  // Alias: bible-chapters.json uses "Song of Solomon" but the canonical name in
  // bible-study-keywords.ts is "Song of Songs" — add an alias so both resolve correctly
  const songOfSolomon = map.get('Song of Solomon');
  if (songOfSolomon && !map.has('Song of Songs')) {
    map.set('Song of Songs', songOfSolomon);
  }

  BIBLE_CHAPTERS_MAP = map;
  return map;
}

// Get chapter verse range for a book and chapter
export function getChapterVerseRange(book: string, chapter: number): { start: number; end: number } | null {
  const map = buildBibleChaptersMap();
  const bookMap = map.get(book);
  if (!bookMap) {
    return null;
  }
  const chapterData = bookMap.get(chapter);
  if (!chapterData) {
    return null;
  }
  return { start: chapterData.startVerse, end: chapterData.endVerse };
}

// Validate if a verse number is valid for a given book and chapter
export function validateVerseNumber(book: string, chapter: number, verse: number): boolean {
  const range = getChapterVerseRange(book, chapter);
  if (!range) {
    return false;
  }
  return verse >= range.start && verse <= range.end;
}

// Validate if a verse range is valid for a given book and chapter
export function validateVerseRange(book: string, chapter: number, startVerse: number, endVerse: number): boolean {
  const range = getChapterVerseRange(book, chapter);
  if (!range) {
    return false;
  }
  // Both start and end must be within the valid range
  return startVerse >= range.start && startVerse <= range.end &&
         endVerse >= range.start && endVerse <= range.end &&
         startVerse <= endVerse;
}

// Validate a cross-chapter verse range like "Exodus 6:28-7:7":
// start verse must be valid in the start chapter, end verse valid in the end chapter,
// and the range must be forward-ordered across chapters.
export function validateCrossChapterRange(
  book: string,
  startChapter: number,
  startVerse: number,
  endChapter: number,
  endVerse: number,
): boolean {
  const startRange = getChapterVerseRange(book, startChapter);
  const endRange = getChapterVerseRange(book, endChapter);
  if (!startRange || !endRange) {
    return false;
  }
  const startOk = startVerse >= startRange.start && startVerse <= startRange.end;
  const endOk = endVerse >= endRange.start && endVerse <= endRange.end;
  const orderOk =
    startChapter < endChapter || (startChapter === endChapter && startVerse <= endVerse);
  return startOk && endOk && orderOk;
}

/**
 * Split "1 Corinthians 13:4-7" into `{ book: '1 Corinthians', tail: '13:4-7' }`.
 * The chapter number is the first digit run preceded by whitespace — leading digits belong to
 * the book name ("1 Corinthians", "2 Kings"). Returns null when there is no numeric tail.
 */
function splitBookAndNumericTail(reference: string): { book: string; tail: string } | null {
  const trimmed = reference.trim();
  const match = trimmed.match(/\s(\d.*)$/);
  if (!match || match.index == null) {
    return null;
  }
  const book = trimmed.slice(0, match.index).trim();
  if (!book) {
    return null;
  }
  return { book, tail: match[1].trim() };
}

// Number of chapters in a book, or null when the book isn't canonical.
export function getBookChapterCount(book: string): number | null {
  const bookMap = buildBibleChaptersMap().get(book);
  if (!bookMap || bookMap.size === 0) {
    return null;
  }
  let max = 0;
  for (const chapter of bookMap.keys()) {
    if (chapter > max) max = chapter;
  }
  return max;
}

/**
 * Whether a reference resolves against the canon, plus a human-readable reason when it doesn't.
 *
 * Detection is deliberately permissive — the regex accepts unbounded digit runs, so a typo like
 * `Exodus 16:1315` (a dropped `-`) parses as verse 1315 and `validateAndWarn` only logs. Committing
 * that produces a pill the server can never resolve, which surfaces to the user as
 * "Could not load this passage." This is the gate that stops such a reference from becoming a pill
 * in the first place; callers should keep the user in edit mode and show `reason`.
 */
export type ScriptureReferenceValidity = { ok: true } | { ok: false; reason: string };

export function checkScriptureReferenceValidity(reference: string): ScriptureReferenceValidity {
  const raw = String(reference ?? '').trim();
  const tooManyChapters = (book: string, count: number): ScriptureReferenceValidity => ({
    ok: false,
    reason: `${book} has ${count} chapter${count === 1 ? '' : 's'}.`,
  });

  // Colon-free shapes — chapter-only ("Psalms 23") and chapter ranges ("Matthew 5-7").
  // Handled before `parseReference` because it *returns null* for an out-of-range chapter
  // (`Jude 2`), which would otherwise surface as an unhelpful "not a complete reference".
  const split = splitBookAndNumericTail(raw);
  if (split && !raw.includes(':')) {
    const canonicalBook = resolveCanonicalBookName(split.book, getBookNameVariations());
    if (!canonicalBook) {
      return { ok: false, reason: `We don't recognize the book "${split.book}".` };
    }
    const chapterCount = getBookChapterCount(canonicalBook);
    if (chapterCount == null) {
      return { ok: false, reason: `We don't recognize the book "${canonicalBook}".` };
    }
    const chapters = (split.tail.match(/\d+/g) ?? []).map((n) => parseInt(n, 10));
    if (chapters.length === 0) {
      return { ok: false, reason: 'Not a complete scripture reference yet.' };
    }
    for (const ch of chapters) {
      if (ch < 1 || ch > chapterCount) {
        return tooManyChapters(canonicalBook, chapterCount);
      }
    }
    if (chapters.length === 2 && chapters[0] > chapters[1]) {
      return { ok: false, reason: 'That range runs backwards.' };
    }
    return { ok: true };
  }

  const parsed = parseReference(raw);
  if (!parsed) {
    return { ok: false, reason: 'Not a complete scripture reference yet.' };
  }

  const { book, chapter, verse, endChapter } = parsed;

  const chapterCount = getBookChapterCount(book);
  if (chapterCount == null) {
    return { ok: false, reason: `We don't recognize the book "${book}".` };
  }
  if (chapter < 1 || chapter > chapterCount) {
    return tooManyChapters(book, chapterCount);
  }

  const describeChapter = (ch: number): string => {
    const range = getChapterVerseRange(book, ch);
    return range ? `${book} ${ch} has ${range.end} verses.` : `${book} has no chapter ${ch}.`;
  };

  if (endChapter != null && Array.isArray(verse)) {
    const [start, end] = verse;
    if (endChapter > chapterCount) {
      return tooManyChapters(book, chapterCount);
    }
    if (validateCrossChapterRange(book, chapter, start, endChapter, end)) {
      return { ok: true };
    }
    if (!validateVerseNumber(book, chapter, start)) {
      return { ok: false, reason: describeChapter(chapter) };
    }
    if (!validateVerseNumber(book, endChapter, end)) {
      return { ok: false, reason: describeChapter(endChapter) };
    }
    return { ok: false, reason: 'That range runs backwards.' };
  }

  if (Array.isArray(verse)) {
    const [start, end] = verse;
    if (validateVerseRange(book, chapter, start, end)) {
      return { ok: true };
    }
    if (start > end) {
      return { ok: false, reason: 'That range runs backwards.' };
    }
    return { ok: false, reason: describeChapter(chapter) };
  }

  if (!validateVerseNumber(book, chapter, verse)) {
    return { ok: false, reason: describeChapter(chapter) };
  }
  return { ok: true };
}

/** Convenience boolean for callers that don't surface the reason. */
export function isResolvableScriptureReference(reference: string): boolean {
  return checkScriptureReferenceValidity(reference).ok;
}

/**
 * Recover the range a user almost certainly meant when the hyphen went missing.
 *
 * `Exodus 16:16-20` typed on iOS can arrive as `Exodus 16:1620` — predictive text eats the
 * `-`, and because detection accepts unbounded digit runs it parses happily as verse 1620.
 * Split the digit run every possible way and accept only when exactly one split yields a
 * real ascending range inside that chapter, so an ambiguous case is never silently guessed:
 *
 *   Exodus 16:1620 -> 16-20   (1|620 and 162|0 are both out of range, so 16|20 is unique)
 *   Psalm 119:1234 -> null    (1|234, 12|34 and 123|4 are all valid — genuinely ambiguous)
 *
 * Returns null when the reference already resolves, isn't this shape, or is ambiguous.
 */
export function repairUnresolvableReference(reference: string): string | null {
  const raw = String(reference ?? '').trim();
  if (!raw || isResolvableScriptureReference(raw)) return null;

  const match = raw.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!match) return null;
  const [, bookPart, chapterPart, digits] = match;
  if (digits.length < 2) return null;

  const canonicalBook = resolveCanonicalBookName(bookPart.trim(), getBookNameVariations());
  if (!canonicalBook) return null;
  const chapter = parseInt(chapterPart, 10);

  const candidates: string[] = [];
  for (let cut = 1; cut < digits.length; cut++) {
    const startText = digits.slice(0, cut);
    const endText = digits.slice(cut);
    // A leading zero on either side was never a verse number the user typed.
    if (startText.length > 1 && startText.startsWith('0')) continue;
    if (endText.length > 1 && endText.startsWith('0')) continue;
    const start = parseInt(startText, 10);
    const end = parseInt(endText, 10);
    if (start >= end) continue;
    if (!validateVerseRange(canonicalBook, chapter, start, end)) continue;
    candidates.push(`${canonicalBook} ${chapter}:${start}-${end}`);
  }

  return candidates.length === 1 ? candidates[0] : null;
}

// Normalize chapter-only reference to include full verse range
// "Genesis 1" → "Genesis 1:1-31"
export function normalizeChapterReference(book: string, chapter: number): string | null {
  const range = getChapterVerseRange(book, chapter);
  if (!range) {
    return null;
  }
  return `${book} ${chapter}:${range.start}-${range.end}`;
}

export interface ScriptureReference {
  book: string;
  chapter: number; // Start chapter
  verse: number | [number, number]; // Single verse or range
  // Present only for cross-chapter ranges (e.g. "Exodus 6:28-7:7"): the chapter the range ENDS in.
  // When set, the second element of `verse` (the end verse) belongs to `endChapter`, NOT `chapter`.
  endChapter?: number;
  reference: string; // Full reference string like "John 3:16", "John 3:16-17", or "Exodus 6:28-7:7"
}

export interface ScriptureDetection {
  isScripture: boolean;
  type: 'reference' | 'text' | 'both' | null;
  references: ScriptureReference[];
  confidence: number;
  detectedText?: string; // The actual text that was detected as scripture
}

// NET Bible copyright attribution
export const NET_BIBLE_COPYRIGHT = 'Scripture quotations are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. http://netbible.com All rights reserved.';

// Get all Bible book names from keywords
const getBibleBookNames = (): string[] => {
  return BIBLE_STUDY_KEYWORDS
    .filter(k => k.category === 'book')
    .map(k => k.name);
};

// Get book name variations (including synonyms)
export const getBookNameVariations = (): string[] => {
  const variations: string[] = [];
  BIBLE_STUDY_KEYWORDS
    .filter(k => k.category === 'book')
    .forEach(k => {
      variations.push(k.name);
      variations.push(...k.synonyms);
    });
  return variations;
};

// Normalize text for matching (remove punctuation, lowercase, etc.)
export const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[.,;:!?'"()\-–—]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

// Format book name for Bible.org API (standard names work directly)
export const formatBookNameForAPI = (bookName: string): string => {
  // Bible.org API accepts standard book names like "John", "1 Corinthians", etc.
  // Just return as-is, API handles them correctly
  return bookName.trim();
};

// Helper function to validate and log warnings for scripture references
/**
 * Dev-only warn budget. These warnings are emitted from `parseReference`, which runs per
 * keystroke, per pill on every setContent, and over the whole body on each autosave — so
 * a single unresolvable pill could produce thousands of identical lines and drown the
 * console (it also tripped PostHog's client-side rate limiter). Warn once per distinct
 * message, and stop entirely past a hard cap.
 */
const WARNED_REFERENCES = new Set<string>();
const MAX_DISTINCT_REFERENCE_WARNINGS = 50;

function warnOnceAboutReference(message: string): void {
  if (typeof import.meta !== 'undefined' && !import.meta.env?.DEV) return;
  if (WARNED_REFERENCES.has(message)) return;
  if (WARNED_REFERENCES.size >= MAX_DISTINCT_REFERENCE_WARNINGS) return;
  WARNED_REFERENCES.add(message);
  console.warn(message);
}

/** Test seam — reset the warn budget between cases. */
export function resetScriptureReferenceWarnings(): void {
  WARNED_REFERENCES.clear();
}

function validateAndWarn(ref: ScriptureReference): ScriptureReference {
  const { book, chapter, verse, endChapter } = ref;

  // Cross-chapter range: validate start/end verses against their own chapters.
  if (endChapter != null && Array.isArray(verse)) {
    const [start, end] = verse;
    if (!validateCrossChapterRange(book, chapter, start, endChapter, end)) {
      warnOnceAboutReference(`Invalid cross-chapter range: ${ref.reference}`);
    }
    return ref;
  }

  if (Array.isArray(verse)) {
    const [start, end] = verse;
    const singleChapterRange = getChapterVerseRange(book, chapter);
    if (singleChapterRange && end > singleChapterRange.end) {
      return ref;
    }
  }

  if (Array.isArray(verse)) {
    // Verse range
    const [start, end] = verse;
    if (!validateVerseRange(book, chapter, start, end)) {
      const range = getChapterVerseRange(book, chapter);
      if (range) {
        warnOnceAboutReference(`Invalid verse range: ${ref.reference}. Valid range for ${book} ${chapter} is ${range.start}-${range.end}`);
      } else {
        warnOnceAboutReference(`Unknown book/chapter: ${book} ${chapter}`);
      }
    }
  } else {
    // Single verse
    if (!validateVerseNumber(book, chapter, verse)) {
      const range = getChapterVerseRange(book, chapter);
      if (range) {
        warnOnceAboutReference(`Invalid verse number: ${ref.reference}. Valid range for ${book} ${chapter} is ${range.start}-${range.end}`);
      } else {
        warnOnceAboutReference(`Unknown book/chapter: ${book} ${chapter}`);
      }
    }
  }
  
  return ref;
}

// Resolve a raw book substring (e.g. "Exodus", "1 cor") to its canonical book name, or null.
/**
 * Resolve a typed book name to its canonical form.
 *
 * Scores every candidate variation and takes the best, rather than returning the first
 * one that happens to match. First-match-wins silently resolved "Philemon" to
 * **Philippians**: `"philemon".startsWith("phil")` is true, and `phil` — a Philippians
 * synonym — appears earlier in the list than Philemon's own entry. A note reading
 * "Philemon 1:6" got a pill full of Philippians.
 *
 * Ranking, strongest first:
 *   3. exact match — what the user typed *is* a known name or abbreviation
 *   2. the variation is a prefix of what they typed ("philemon" ⊃ "phil"), longest wins,
 *      so a book's own full name always beats another book's shorter abbreviation
 *   1. what they typed is a prefix of the variation ("rom" → "Romans"), longest wins
 *
 * A tie inside a rank keeps list order, so genuinely ambiguous input ("Phil") still
 * resolves the way it always has — to Philippians, whose declared synonym it is.
 */
export function resolveCanonicalBookName(bookPart: string, bookNames: string[]): string | null {
  const normalizedBookPart = normalizeText(bookPart);
  if (!normalizedBookPart) return null;

  let best: { rank: number; weight: number; bookName: string } | null = null;

  for (const bookName of bookNames) {
    const normalizedBookName = normalizeText(bookName);
    if (!normalizedBookName) continue;

    let rank = 0;
    let weight = 0;
    if (normalizedBookPart === normalizedBookName) {
      rank = 3;
      weight = normalizedBookName.length;
    } else if (normalizedBookPart.startsWith(normalizedBookName)) {
      rank = 2;
      weight = normalizedBookName.length;
    } else if (normalizedBookName.startsWith(normalizedBookPart)) {
      rank = 1;
      weight = normalizedBookPart.length;
    } else {
      continue;
    }

    if (!best || rank > best.rank || (rank === best.rank && weight > best.weight)) {
      best = { rank, weight, bookName };
    }
  }

  if (!best) return null;

  return (
    BIBLE_STUDY_KEYWORDS.find(
      k =>
        k.category === 'book' &&
        (k.name.toLowerCase() === best!.bookName.toLowerCase() ||
          k.synonyms.some(s => s.toLowerCase() === best!.bookName.toLowerCase())),
    )?.name || best.bookName
  );
}

// Parse scripture reference from text
const parseReference = (match: string): ScriptureReference | null => {
  // Patterns: "John 3:16", "1 Corinthians 13:4-7", "Matthew 26:6-13, 17-30"
  // Match: Book Chapter:VerseGroups where VerseGroups can be "6-13, 17-30" or "6-13" or "6"
  // Updated to handle optional spaces around dashes: "6 - 13" or "6-13"
  // Updated to handle different dash types: hyphen (-), en-dash (–), em-dash (—)
  const patterns = [
    // Comma-separated verse groups: "Book 1:2-3, 5-7, 10" or "Book 1:2 - 3, 5 - 7, 10"
    /^(.+?)\s+(\d+):((?:\d+(?:\s*[-–—]\s*\d+)?)(?:,\s*\d+(?:\s*[-–—]\s*\d+)?)*)$/,
    // Single range: "Book 1:2-3" or "Book 1:2 - 3"
    /^(.+?)\s+(\d+):(\d+)\s*[-–—]\s*(\d+)$/,
    // Single verse: "Book 1:2"
    /^(.+?)\s+(\d+):(\d+)$/,
  ];

  const bookNames = getBookNameVariations();
  const normalizedMatch = match.trim();

  // Cross-chapter range: "Exodus 6:28-7:7" (startChapter:startVerse — endChapter:endVerse).
  // Handled before the single-chapter patterns since those only model one chapter.
  const crossChapterMatch = normalizedMatch.match(/^(.+?)\s+(\d+):(\d+)\s*[-–—]\s*(\d+):(\d+)$/);
  if (crossChapterMatch) {
    const startCh = parseInt(crossChapterMatch[2], 10);
    const startV = parseInt(crossChapterMatch[3], 10);
    const endCh = parseInt(crossChapterMatch[4], 10);
    const endV = parseInt(crossChapterMatch[5], 10);
    const ordered =
      ![startCh, startV, endCh, endV].some(n => isNaN(n)) &&
      (startCh < endCh || (startCh === endCh && startV <= endV));
    if (ordered) {
      const canonicalBook = resolveCanonicalBookName(crossChapterMatch[1].trim(), bookNames);
      if (canonicalBook) {
        return validateAndWarn({
          book: canonicalBook,
          chapter: startCh,
          verse: [startV, endV] as [number, number],
          endChapter: endCh,
          reference: `${canonicalBook} ${startCh}:${startV}-${endCh}:${endV}`,
        });
      }
    }
  }

  for (const pattern of patterns) {
    const matchResult = normalizedMatch.match(pattern);
    if (!matchResult) continue;

    const bookPart = matchResult[1].trim();
    const chapter = parseInt(matchResult[2]);

    // One shared resolver rather than a second copy of the matching rules — the copy
    // that used to live here is how the Philemon bug reached two code paths at once.
    const canonicalBook = resolveCanonicalBookName(bookPart, bookNames);
    if (canonicalBook) {
        if (matchResult.length === 4 && matchResult[3].includes(',')) {
          // Comma-separated verse groups detected (e.g., "6-13, 17-30")
          const verseGroups = matchResult[3].trim();
          // Extract first and last verse numbers from all groups
          const allVerses: number[] = [];
          verseGroups.split(',').forEach(group => {
            const trimmed = group.trim();
            if (/[-–—]/.test(trimmed)) {
              const [start, end] = trimmed.split(/[-–—]/).map(v => parseInt(v.trim()));
              // Validate range: start must be <= end
              if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let v = start; v <= end; v++) {
                  allVerses.push(v);
                }
              } else if (!isNaN(start) && !isNaN(end) && start > end) {
                // Invalid range (start > end) - treat as single verse
                allVerses.push(start);
              }
            } else {
              allVerses.push(parseInt(trimmed));
            }
          });
          
          const verseStart = Math.min(...allVerses);
          const verseEnd = Math.max(...allVerses);
          
          // Clean up verse groups: remove spaces after commas and normalize spaces around dashes for API
          let cleanVerseGroups = verseGroups.replace(/,\s+/g, ',');
          cleanVerseGroups = cleanVerseGroups.replace(/\s*-\s*/g, '-');
          
          return validateAndWarn({
            book: canonicalBook,
            chapter,
            verse: [verseStart, verseEnd] as [number, number],
            reference: `${canonicalBook} ${chapter}:${cleanVerseGroups}`
          });
        } else if (matchResult.length === 5) {
          // Single range detected (Pattern 2: separate capture groups for start and end)
          const verseStart = parseInt(matchResult[3]);
          const verseEnd = parseInt(matchResult[4]);
          // Validate range: start must be <= end
          if (!isNaN(verseStart) && !isNaN(verseEnd) && verseStart <= verseEnd) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: [verseStart, verseEnd] as [number, number],
              reference: `${canonicalBook} ${chapter}:${verseStart}-${verseEnd}`
            });
          } else if (!isNaN(verseStart) && !isNaN(verseEnd) && verseStart > verseEnd) {
            // Backwards range (e.g. "42-25"). Keep it as a range (not a truncated single verse)
            // so checkScriptureReferenceValidity's array-based backward-range check rejects it
            // outright, rather than silently dropping the "-25" tail and pilling just "42" — see
            // scripture.context.md gotcha on the shared-page rendering bug this used to cause.
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: [verseStart, verseEnd] as [number, number],
              reference: `${canonicalBook} ${chapter}:${verseStart}-${verseEnd}`
            });
          }
          // If parsing fails, fall through to single verse
        } else if (matchResult.length === 4 && !matchResult[3].includes(',') && /[-–—]/.test(matchResult[3])) {
          // Single range detected (Pattern 1: range in single capture group like "8-23")
          const versePart = matchResult[3].trim();
          const [start, end] = versePart.split(/\s*[-–—]\s*/).map(v => parseInt(v.trim()));
          // Validate range: start must be <= end
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: [start, end] as [number, number],
              reference: `${canonicalBook} ${chapter}:${start}-${end}`
            });
          } else if (!isNaN(start) && !isNaN(end) && start > end) {
            // Backwards range (e.g. "42-25"). Keep it as a range (not a truncated single verse)
            // so checkScriptureReferenceValidity's array-based backward-range check rejects it
            // outright, rather than silently dropping the "-25" tail and pilling just "42" — see
            // scripture.context.md gotcha on the shared-page rendering bug this used to cause.
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse: [start, end] as [number, number],
              reference: `${canonicalBook} ${chapter}:${start}-${end}`
            });
          }
          // Fall through to single verse if parsing fails
        } else if (matchResult.length === 4 && !matchResult[3].includes(',') && !/[-–—]/.test(matchResult[3])) {
          // Single verse - check for dash using regex to handle all dash types
          const verse = parseInt(matchResult[3]);
          if (!isNaN(verse)) {
            return validateAndWarn({
              book: canonicalBook,
              chapter,
              verse,
              reference: `${canonicalBook} ${chapter}:${verse}`
            });
          }
        }
    }
  }

  // Chapter range without colon: "Matthew 5-7"
  if (!normalizedMatch.includes(':')) {
    const chapterRangeMatch = normalizedMatch.match(/^(.+?)\s+(\d+)\s*[-–—]\s*(\d+)$/);
    if (chapterRangeMatch) {
      const bookPart = chapterRangeMatch[1].trim();
      const startCh = parseInt(chapterRangeMatch[2], 10);
      const endCh = parseInt(chapterRangeMatch[3], 10);
      if (!isNaN(startCh) && !isNaN(endCh) && endCh > startCh) {
        const canonicalBook = resolveCanonicalBookName(bookPart, bookNames);
        if (canonicalBook) {
          const vrStart = getChapterVerseRange(canonicalBook, startCh);
          const vrEnd = getChapterVerseRange(canonicalBook, endCh);
          if (vrStart && vrEnd) {
            return validateAndWarn({
              book: canonicalBook,
              chapter: startCh,
              verse: [vrStart.start, vrEnd.end],
              reference: `${canonicalBook} ${startCh}-${endCh}`,
            });
          }
        }
      }
    }

    // Chapter-only: "John 3", "Psalm 23"
    const chapterOnlyMatch = normalizedMatch.match(/^(.+?)\s+(\d+)$/);
    if (chapterOnlyMatch) {
      const bookPart = chapterOnlyMatch[1].trim();
      const ch = parseInt(chapterOnlyMatch[2], 10);
      if (!isNaN(ch)) {
        const canonicalBook = resolveCanonicalBookName(bookPart, bookNames);
        if (canonicalBook) {
          const expanded = normalizeChapterReference(canonicalBook, ch);
          const vr = getChapterVerseRange(canonicalBook, ch);
          if (expanded && vr) {
            return validateAndWarn({
              book: canonicalBook,
              chapter: ch,
              verse: [vr.start, vr.end],
              reference: expanded,
            });
          }
        }
      }
    }
  }

  return null;
};

// Validate if a detected reference is in a valid scripture context
// Rejects matches that are part of larger phrases (e.g., "John 3 years ago")
// This is a conservative check - only rejects clear false positives
function isValidScriptureContext(text: string, matchIndex: number, matchLength: number): boolean {
  const before = text.substring(Math.max(0, matchIndex - 30), matchIndex).trim();
  const after = text.substring(matchIndex + matchLength, matchIndex + matchLength + 30).trim();
  
  // Check if followed by common non-scripture words that indicate it's not a reference
  // Only check for words that are VERY likely to be false positives
  // Use word boundary to ensure we match whole words, not parts of words
  const invalidAfterPattern = /\b(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\s+(ago|later|before|after)\b/i;
  if (invalidAfterPattern.test(after)) {
    // Pattern like "3 years ago" or "5 dollars" - clear false positive
    return false;
  }
  
  // Check for specific false positive patterns
  // "John 3 years" - the word "years" immediately after a number
  const falsePositivePattern = /^\s*(years?|months?|days?|dollars?|people|times?|hours?|minutes?|seconds?|weeks?)\b/i;
  if (falsePositivePattern.test(after)) {
    // Check if the reference ends with just a number (chapter-only pattern)
    // This catches "John 3 years" but allows "John 3:16 years" (though that's also unlikely)
    const refText = text.substring(matchIndex, matchIndex + matchLength);
    // If reference is just "Book Number" (no colon), and followed by "years", it's likely false
    if (!refText.includes(':') && falsePositivePattern.test(after)) {
      return false;
    }
  }
  
  // Valid references should be followed by punctuation, newline, space, or end of text
  // Allow most characters after - only reject if it's clearly part of a word
  const firstCharAfter = after.charAt(0);
  
  // If there's no text after, it's valid (end of text)
  if (!firstCharAfter) {
    return true;
  }
  
  // If it's a space, punctuation, or newline, it's valid
  const validAfterChars = /^[.,;:!?\s\n]/;
  if (validAfterChars.test(firstCharAfter)) {
    return true;
  }
  
  // If it's a lowercase letter immediately after (no space), it might be part of a word
  // But be conservative - only reject if it's clearly part of a word
  // For example, "John 3:16is" would be invalid, but "John 3:16 is" is valid (space before "is")
  // Since we already checked for space above, if we get here and it's lowercase, it might be invalid
  // But be very conservative - only reject if it's a common word pattern
  if (/^[a-z]/.test(after)) {
    // Check if it's a common word that would make it a false positive
    const commonWordsAfter = /^(is|are|was|were|has|have|had|will|would|can|could|should|may|might)\b/i;
    if (commonWordsAfter.test(after)) {
      // This is likely a false positive like "John 3 is" (though "John 3:16 is" should be valid)
      // But since there's no space, it's probably "John 3is" which is invalid
      // Actually, if there's no space, the regex wouldn't have matched "John 3" in the first place
      // So this is probably safe to allow
      return true; // Allow it - the regex matching already ensures proper spacing
    }
  }
  
  // Check if preceded by words that make it part of a phrase
  // Only reject if it's clearly a prepositional phrase
  const invalidBefore = /\b(about|around|over|under|near|from|to|at|in|on|for|with|by)\s+$/i;
  if (invalidBefore.test(before)) {
    // But allow if it's part of a valid phrase like "referring to John 3:16"
    // Actually, this is probably a false positive, so reject it
    return false;
  }
  
  // Default: allow the reference (be permissive)
  return true;
}

// Detect scripture references in text
export const detectScriptureReferences = (text: string): ScriptureReference[] => {
  const references: ScriptureReference[] = [];
  // Use variations (including synonyms) for detection, e.g., "Psalm" for "Psalms"
  const bookNames = getBookNameVariations();

  // Build regex pattern for all book names
  // Escape special regex characters
  const escapedBookNames = bookNames.map(name => 
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  // Dash pattern that matches hyphen (-), en-dash (–), and em-dash (—)
  const dashPattern = '[-–—]';
  
  // Pattern 1: "Book Chapter:Verse" or "Book Chapter:Verse-Verse" or "Book Chapter:Verse-Verse, Verse-Verse"
  // Captures comma-separated verse groups like "Matthew 26:6-13, 17-30"
  // Use a simpler pattern and validate matches afterward
  // Updated to handle different dash types (hyphen, en-dash, em-dash)
  // FIXED: Ensure verse numbers are fully captured by using word boundary or end of string
  // Changed negative lookahead to prevent matching when followed by digit that's part of another reference
  // This ensures "John 1:14" matches fully, not "John 1:1" from "John 1:14"
  // Use (?!\\d) to stop at word boundary or non-digit, but allow matching full multi-digit verses
  const referencePattern = new RegExp(
    `\\b(${escapedBookNames.join('|')})\\s+(\\d+):(\\d+(?:\\s*${dashPattern}\\s*\\d+)?(?:,\\s*\\d+(?:\\s*${dashPattern}\\s*\\d+)?)*)(?=\\s|$|[^\\d\\w])`,
    'gi'
  );

  let match;

  // Character spans claimed by a more-specific pass so later passes don't re-match inside them
  // (e.g. the single-chapter pattern would otherwise grab "Exodus 6:28-7" from "Exodus 6:28-7:7").
  const claimedRanges: Array<{ start: number; end: number }> = [];
  const overlapsClaimed = (start: number, end: number) =>
    claimedRanges.some(r => start < r.end && r.start < end);

  // Pass 0: cross-chapter ranges (most specific) — "Exodus 6:28-7:7"
  const crossChapterPattern = new RegExp(
    `\\b(${escapedBookNames.join('|')})\\s+(\\d+):(\\d+)\\s*${dashPattern}\\s*(\\d+):(\\d+)(?=\\s|$|[^\\d\\w])`,
    'gi',
  );
  while ((match = crossChapterPattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const extracted = parseReference(fullMatch.trim());
    if (extracted && extracted.endChapter != null) {
      if (!isValidScriptureContext(text, match.index, fullMatch.length)) continue;
      extracted.reference = fullMatch;
      const normalizedExtracted = normalizeScriptureReference(extracted.reference);
      const isDuplicate = references.some(
        ref => normalizeScriptureReference(ref.reference) === normalizedExtracted,
      );
      if (!isDuplicate) {
        references.push(extracted);
        claimedRanges.push({ start: match.index, end: match.index + fullMatch.length });
      }
    }
  }

  // First, find chapter:verse references (most specific)
  while ((match = referencePattern.exec(text)) !== null) {
    let fullMatch = match[0];
    const originalMatchEnd = match.index + fullMatch.length;
    let adjustedLastIndex = originalMatchEnd;

    // Skip matches that fall inside a span already claimed by the cross-chapter pass.
    if (overlapsClaimed(match.index, originalMatchEnd)) {
      continue;
    }
    
    // Check if the match ends with ", number" and what follows forms a book name
    // This indicates we matched too much (e.g., "Hebrews 13:2, 1" when "1 Peter" follows)
    const versePartMatch = fullMatch.match(/:\s*([^:]+)$/);
    if (versePartMatch && versePartMatch[1].includes(',')) {
      const verseGroups = versePartMatch[1];
      const lastCommaIndex = verseGroups.lastIndexOf(',');
      if (lastCommaIndex >= 0) {
        const afterLastComma = verseGroups.substring(lastCommaIndex + 1).trim();
        // If after the comma we have just a number (like "1"), check if it's part of a book name
        if (/^\d+$/.test(afterLastComma)) {
          // Check what comes after our match in the original text
          const textAfterMatch = text.substring(originalMatchEnd);
          // Extract the first word after the space (e.g., "Peter" from " Peter 4:9")
          const wordAfterSpace = textAfterMatch.match(/^\s+(\w+)/)?.[1];
          
          if (wordAfterSpace) {
            // Check if "number + space + word" forms a book name
            // For example, if we have ", 1" and " Peter" follows, check if "1 Peter" is a book name
            const potentialBookName = `${afterLastComma} ${wordAfterSpace}`;
            
            // Check if this potential book name matches any book name (including numbered books)
            const matchesBookName = bookNames.some(bookName => {
              const normalizedBook = normalizeText(bookName);
              const normalizedPotential = normalizeText(potentialBookName);
              return normalizedBook === normalizedPotential || 
                     normalizedBook.startsWith(normalizedPotential) ||
                     normalizedPotential.startsWith(normalizedBook);
            });
            
            if (matchesBookName) {
              // The number is part of the next book name, trim it from the match
              const trimmedLength = verseGroups.length - lastCommaIndex;
              fullMatch = fullMatch.substring(0, fullMatch.length - trimmedLength);
              // Adjust the regex's lastIndex to point to after the trimmed match
              // This ensures the next iteration can find "1 Peter 4:9"
              adjustedLastIndex = match.index + fullMatch.length;
            }
          }
        }
      }
    }
    
    const extracted = parseReference(fullMatch);
    if (extracted) {
      // Context validation: Check if this match is in a valid scripture context
      if (!isValidScriptureContext(text, match.index, fullMatch.length)) {
        // Skip this match - it's likely a false positive (e.g., "John 3 years ago")
        continue;
      }
      
      // Validation: Ensure the verse number in the parsed reference matches what was in the original match
      // This prevents issues where "John 1:14" might be incorrectly parsed as "John 1:1"
      const versePartInMatch = fullMatch.match(/:\s*(\d+)/);
      if (versePartInMatch) {
        const verseInMatch = parseInt(versePartInMatch[1]);
        if (Array.isArray(extracted.verse)) {
          // Verse range - check if start verse matches
          if (extracted.verse[0] !== verseInMatch && extracted.verse[0] < verseInMatch) {
            if (DEBUG) {
              console.warn('[Scripture Detection] Verse mismatch detected:', {
                originalMatch: fullMatch,
                parsedVerse: extracted.verse[0],
                matchVerse: verseInMatch
              });
            }
            // Re-parse with the correct verse number from the match
            const correctedVerse = verseInMatch;
            extracted.verse = correctedVerse;
            extracted.reference = `${extracted.book} ${extracted.chapter}:${correctedVerse}`;
          }
        } else {
          // Single verse - check if it matches
          if (extracted.verse !== verseInMatch && extracted.verse < verseInMatch) {
            // Correct the verse number
            extracted.verse = verseInMatch;
            extracted.reference = `${extracted.book} ${extracted.chapter}:${verseInMatch}`;
          }
        }
      }
      
      // Preserve the original matched text for display (with spaces intact)
      // Override the cleaned reference with the original to maintain user's formatting
      extracted.reference = fullMatch;
      
      // Avoid duplicates by comparing normalized references
      // This prevents duplicates like "John 3:16" vs "John 3: 16"
      const normalizedExtracted = normalizeScriptureReference(extracted.reference);
      const isDuplicate = references.some(ref => {
        const normalizedRef = normalizeScriptureReference(ref.reference);
        return normalizedRef === normalizedExtracted;
      });
      if (!isDuplicate) {
        references.push(extracted);
      }
    }
    
    // Adjust the regex's lastIndex if we trimmed the match
    if (adjustedLastIndex !== originalMatchEnd) {
      referencePattern.lastIndex = adjustedLastIndex;
    }
  }

  // Chapter range without colon (e.g. Matthew 5-7) — run before chapter-only so "Matthew 5" does not steal from "5-7"
  const chapterRangePattern = new RegExp(
    `\\b(${escapedBookNames.join('|')})\\s+(\\d+)\\s*${dashPattern}\\s*(\\d+)(?!\\s*:)(?=\\s|$|[^\\d\\w-])`,
    'gi'
  );
  while ((match = chapterRangePattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const extracted = parseReference(fullMatch.trim());
    if (extracted && !fullMatch.includes(':')) {
      if (!isValidScriptureContext(text, match.index, fullMatch.length)) continue;
      extracted.reference = fullMatch;
      const normalizedExtracted = normalizeScriptureReference(extracted.reference);
      const isDuplicate = references.some(ref => {
        const normalizedRef = normalizeScriptureReference(ref.reference);
        return normalizedRef === normalizedExtracted;
      });
      if (!isDuplicate) {
        references.push(extracted);
      }
    }
  }

  // Chapter-only (e.g. Psalm 23, John 3) — not followed by ":" or by "-chapter" range
  const chapterOnlyPattern = new RegExp(
    `\\b(${escapedBookNames.join('|')})\\s+(\\d+)(?!\\s*:)(?!\\s*${dashPattern}\\s*\\d)(?=\\s|$|[^\\d\\w])`,
    'gi'
  );
  while ((match = chapterOnlyPattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const extracted = parseReference(fullMatch.trim());
    if (extracted && !fullMatch.includes(':')) {
      if (!isValidScriptureContext(text, match.index, fullMatch.length)) continue;
      extracted.reference = fullMatch;
      const normalizedExtracted = normalizeScriptureReference(extracted.reference);
      const isDuplicate = references.some(ref => {
        const normalizedRef = normalizeScriptureReference(ref.reference);
        return normalizedRef === normalizedExtracted;
      });
      if (isDuplicate) continue;
      // Drop chapter-only if we already have any verse-level ref in the same chapter (e.g. John 3:16 ⊃ John 3)
      const hasVerseLevelInChapter = references.some(
        r => r.book === extracted.book && r.chapter === extracted.chapter && r.reference.includes(':')
      );
      if (hasVerseLevelInChapter) continue;
      references.push(extracted);
    }
  }

  return references;
};

/** A scripture reference with an optional inline translation override (e.g., "John 3:16 ESV") */
export interface ScriptureReferenceWithTranslation extends ScriptureReference {
  translation?: string;
}

/**
 * Detects scripture references with optional trailing translation abbreviation.
 * E.g., "John 3:16 ESV" → { reference: "John 3:16", translation: "ESV" }
 * The translation abbreviation is consumed from the text and stored separately.
 */
export const detectScriptureReferencesWithTranslation = (text: string): ScriptureReferenceWithTranslation[] => {
  const baseRefs = detectScriptureReferences(text);
  if (baseRefs.length === 0) return [];

  return baseRefs.map(ref => {
    const refEndIndex = text.lastIndexOf(ref.reference);
    if (refEndIndex === -1) return ref;

    const afterRef = text.substring(refEndIndex + ref.reference.length);
    const trailing = matchTrailingTranslationAbbreviation(afterRef);
    if (trailing) {
      return {
        ...ref,
        translation: trailing.canonicalId,
      };
    }
    return ref;
  });
};

// Parse scripture reference string into components
export const parseScriptureReference = (reference: string): { book: string; chapter: number; verse: number | [number, number]; endChapter?: number } | null => {
  const parsed = parseReference(reference);
  if (!parsed) return null;

  return {
    book: parsed.book,
    chapter: parsed.chapter,
    verse: parsed.verse,
    endChapter: parsed.endChapter,
  };
};

// Main detection function
export const detectScripture = async (text: string): Promise<ScriptureDetection> => {
  if (!text || text.trim().length === 0) {
    return {
      isScripture: false,
      type: null,
      references: [],
      confidence: 0
    };
  }

  // Strip HTML tags for detection
  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Step 1: Detect references
  const references = detectScriptureReferences(plainText);
  
  if (references.length > 0) {
    return {
      isScripture: true,
      type: 'reference',
      references,
      confidence: 0.9,
      detectedText: plainText
    };
  }

  // Step 2: Future - verse text detection would go here
  // For now, we only detect references

  return {
    isScripture: false,
    type: null,
    references: [],
    confidence: 0
  };
};

// Extract the best/most confident reference from detection
export const getPrimaryReference = (detection: ScriptureDetection): string | null => {
  if (detection.references.length > 0) {
    return detection.references[0].reference;
  }
  return null;
};

// Format scripture reference for display with divider between comma-separated groups
// "Matthew 26:6-13,17-30" → "Matthew 26:6-13 | 17-30"
export const formatReferenceForDisplay = (reference: string): string => {
  // Match pattern: Book Chapter:VerseGroups where VerseGroups can have commas
  const pattern = /^(.+?\s+\d+:)(.+)$/;
  const match = reference.match(pattern);
  
  if (!match) return reference;
  
  const prefix = match[1]; // e.g., "Matthew 26:"
  const verseGroups = match[2]; // e.g., "6-13,17-30"
  
  // Replace commas between verse groups with " | "
  const formattedGroups = verseGroups.replace(/,(?=\s*\d)/g, ' | ');
  
  return prefix + formattedGroups;
};

// Convert display format back to API format
// "Matthew 26:6-13 | 17-30" → "Matthew 26:6-13,17-30"
export const formatReferenceForAPI = (reference: string): string => {
  // Replace " | " (with spaces) with comma (no space)
  return reference.replace(/\s+\|\s+/g, ',');
};

// Normalize scripture reference to consistent format for storage and comparison
// Handles various spacing formats: "John 3: 16", "John 3:16 - 17", "Matthew 26:6-13, 17-30"
// Returns: "John 3:16", "John 3:16-17", "Matthew 26:6-13,17-30"
export const normalizeScriptureReference = (reference: string): string => {
  if (!reference || typeof reference !== 'string') {
    return reference;
  }

  // First, try to parse and use the normalized format from parseReference
  // This ensures we get the canonical book name and proper formatting
  const parsed = parseReference(reference.trim());
  if (parsed) {
    return parsed.reference;
  }

  // If parsing fails, do manual normalization
  // Remove spaces after colons: "John 3: 16" → "John 3:16"
  let normalized = reference.replace(/:\s+/g, ':');
  
  // Remove spaces after commas: "Matthew 26:6-13, 17-30" → "Matthew 26:6-13,17-30"
  normalized = normalized.replace(/,\s+/g, ',');
  
  // Normalize all dash types (en-dash, em-dash) to regular hyphens and remove spaces
  // "John 3:16 – 17" or "John 3:16—17" → "John 3:16-17"
  normalized = normalized.replace(/(\d+)\s*[-–—]\s*(\d+)/g, '$1-$2');
  
  // Trim whitespace
  normalized = normalized.trim();
  
  return normalized;
};

/**
 * Canonicalize a reference for DISPLAY while preserving the shape the user typed.
 *
 * `normalizeScriptureReference` runs through `parseReference`, which *expands* colon-free shapes
 * ("Psalm 23" → "Psalm 23:1-6"). That is right for storage and lookup but wrong for pill text: a
 * chapter-only reference must stay chapter-only. This fixes only what should be fixed — book-name
 * casing and abbreviations ("exodus"/"ex" → "Exodus", "1 cor" → "1 Corinthians") plus dash/colon
 * spacing — and leaves the numeric tail's structure alone.
 *
 * Returns the input unchanged when the book can't be resolved.
 */
export const canonicalizeScriptureReferenceDisplay = (reference: string): string => {
  if (!reference || typeof reference !== 'string') {
    return reference;
  }
  const trimmed = reference.trim();
  const split = splitBookAndNumericTail(trimmed);
  if (!split) {
    return trimmed;
  }
  const canonicalBook = resolveCanonicalBookName(split.book, getBookNameVariations());
  if (!canonicalBook) {
    return trimmed;
  }
  const tail = split.tail
    .replace(/:\s+/g, ':')
    .replace(/,\s+/g, ',')
    .replace(/(\d+)\s*[-–—]\s*/g, '$1-')
    .trim();
  return `${canonicalBook} ${tail}`;
};

// Parse verse groups from a reference string
// "Matthew 26:6-13,17-30" → [{ start: 6, end: 13 }, { start: 17, end: 30 }]
export interface VerseGroup {
  start: number;
  end: number;
}

export const parseVerseGroups = (reference: string): VerseGroup[] => {
  // Extract the verse part after the colon
  const match = reference.match(/:\s*([^:]+)$/);
  if (!match) return [];

  const versePart = match[1].trim(); // e.g., "6-13,17-30" or "6-13 | 17-30"
  
  // Remove spaces and normalize (handle both comma and pipe separators)
  const normalized = versePart.replace(/\s+\|\s+/g, ',').replace(/,\s+/g, ',');
  
  // Split by comma to get individual groups
  const groups: VerseGroup[] = [];
  normalized.split(',').forEach(group => {
    const trimmed = group.trim();
    if (/[-–—]/.test(trimmed)) {
      const [start, end] = trimmed.split(/[-–—]/).map(v => parseInt(v.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        groups.push({ start, end });
      }
    } else {
      // Single verse
      const verse = parseInt(trimmed);
      if (!isNaN(verse)) {
        groups.push({ start: verse, end: verse });
      }
    }
  });

  return groups;
};

