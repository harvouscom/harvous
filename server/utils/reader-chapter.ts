/**
 * Reader lens — projects a chapter of Scripture together with the study material the
 * user already has against it.
 *
 * This is a read-only projection over existing data: `ScriptureMetadata` supplies the
 * notes that cite a passage, `StudyThreadEntries.scriptureReference` supplies the
 * highlights. Nothing here owns study material; the notes layer stays the source of
 * truth and the reader only rearranges it into passage order.
 *
 * The joining is kept pure so it can be tested without a database.
 */
import { verseKeysFromScriptureReference, verseKeyFromParts } from '@/utils/scripture-verse-keys';
import { bibleBookChapterCounts } from '@/utils/bible-book-chapters';

let canonicalBookLookup: Map<string, string> | null = null;

/**
 * Canonical book name for loosely-typed input (`"1john"`, `"PSALMS"`), or null when the
 * book is unknown. `BibleVerses.book` and `ScriptureMetadata.book` both store the full
 * canonical name, so every reader query has to land on exactly that spelling.
 */
export function canonicalizeReaderBook(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  if (!canonicalBookLookup) {
    canonicalBookLookup = new Map();
    for (const book of bibleBookChapterCounts().keys()) {
      const lower = book.toLowerCase();
      canonicalBookLookup.set(lower, book);
      canonicalBookLookup.set(lower.replace(/\s+/g, ''), book);
    }
  }
  const lower = input.toLowerCase();
  return canonicalBookLookup.get(lower) ?? canonicalBookLookup.get(lower.replace(/\s+/g, '')) ?? null;
}

/** A `ScriptureMetadata` row, narrowed to what the projection needs. */
export interface ReaderPassageRow {
  noteId: string;
  noteTitle: string | null;
  reference: string;
  chapter: number;
  /** Start verse; null on rows that only ever recorded a chapter. */
  verse: number | null;
  verseEnd: number | null;
  chapterEnd: number | null;
}

/** A `StudyThreadEntries` row, narrowed to what the projection needs. */
export interface ReaderHighlightRow {
  id: string;
  parentNoteId: string;
  parentNoteTitle: string | null;
  scriptureReference: string | null;
  highlightAccentRaw: string;
  entryKindRaw: string;
  scripturePassageExcerpt: string | null;
}

export interface ReaderVerseNote {
  noteId: string;
  title: string | null;
  reference: string;
}

export interface ReaderVerseHighlight {
  id: string;
  parentNoteId: string;
  parentNoteTitle: string | null;
  accent: string;
  entryKind: string;
  reference: string;
  excerpt: string | null;
}

export interface ReaderVerseStudy {
  notes: ReaderVerseNote[];
  highlights: ReaderVerseHighlight[];
}

/**
 * Which verses of `chapter` a passage row covers.
 *
 * A single row can span a range (`verse`..`verseEnd`) and, when `chapterEnd` is set, run
 * across chapters — so the same row contributes a different slice depending on which
 * chapter is being read. `maxVerse` bounds the open-ended cases.
 */
export function versesCoveredInChapter(
  row: Pick<ReaderPassageRow, 'chapter' | 'verse' | 'verseEnd' | 'chapterEnd'>,
  chapter: number,
  maxVerse: number,
): number[] {
  if (maxVerse < 1) return [];
  const endChapter = row.chapterEnd ?? row.chapter;
  if (chapter < row.chapter || chapter > endChapter) return [];

  const start = row.verse ?? 1;
  const from = chapter === row.chapter ? start : 1;
  let to: number;
  if (chapter === endChapter) {
    // A row with no verseEnd covers just its start verse when it names one chapter,
    // but runs to the end of the closing chapter when it spans several.
    to = row.verseEnd ?? (endChapter === row.chapter ? start : maxVerse);
  } else {
    to = maxVerse;
  }

  const lo = Math.max(1, Math.min(from, maxVerse));
  const hi = Math.max(lo, Math.min(to, maxVerse));
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
}

/**
 * Build the per-verse study map for one chapter.
 *
 * Highlights carry only an opaque normalized reference string, so they are expanded via
 * `verseKeysFromScriptureReference` and matched by verse key. That expansion walks a
 * single chapter, so a highlight stored across a chapter boundary (`John 2:20-3:5`) lands
 * only on the verses of its opening chapter — the same limitation the rest of the app has.
 */
export function buildReaderChapterStudy(input: {
  book: string;
  chapter: number;
  maxVerse: number;
  passages: ReaderPassageRow[];
  highlights: ReaderHighlightRow[];
}): Record<number, ReaderVerseStudy> {
  const { book, chapter, maxVerse, passages, highlights } = input;
  const byVerse: Record<number, ReaderVerseStudy> = {};
  const ensure = (verse: number): ReaderVerseStudy => {
    if (!byVerse[verse]) byVerse[verse] = { notes: [], highlights: [] };
    return byVerse[verse];
  };

  for (const row of passages) {
    for (const verse of versesCoveredInChapter(row, chapter, maxVerse)) {
      const slot = ensure(verse);
      // One note can cite the same verse through several rows; show it once.
      if (slot.notes.some((n) => n.noteId === row.noteId)) continue;
      slot.notes.push({ noteId: row.noteId, title: row.noteTitle, reference: row.reference });
    }
  }

  for (const row of highlights) {
    const reference = row.scriptureReference?.trim();
    if (!reference) continue;
    const keys = new Set(verseKeysFromScriptureReference(reference));
    if (keys.size === 0) continue;
    for (let verse = 1; verse <= maxVerse; verse++) {
      if (!keys.has(verseKeyFromParts({ book, chapter, verse }))) continue;
      ensure(verse).highlights.push({
        id: row.id,
        parentNoteId: row.parentNoteId,
        parentNoteTitle: row.parentNoteTitle,
        accent: row.highlightAccentRaw,
        entryKind: row.entryKindRaw,
        reference,
        excerpt: row.scripturePassageExcerpt,
      });
    }
  }

  return byVerse;
}

/**
 * SQL `LIKE` pattern matching highlights stored against a chapter.
 *
 * References are normalized on write (`normalizeScriptureReference`), so a chapter's
 * highlights all read `"<Book> <chapter>:…"`. Narrowing in SQL keeps the reference
 * expansion off every row the user owns. Underscores are escaped because `_` is a
 * single-character wildcard in `LIKE` and book names such as `Song of Solomon` are
 * otherwise literal.
 */
export function chapterReferenceLikePattern(book: string, chapter: number): string {
  const escaped = book.replace(/([%_\\])/g, '\\$1');
  return `${escaped} ${chapter}:%`;
}
