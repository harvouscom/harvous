/**
 * The verse number a printed NABRE or Douay-Rheims gives, where it isn't Harvous's.
 *
 * Harvous stores every translation in one (English) numbering so a reference means the same
 * verse everywhere. A Catholic reader's missal doesn't: "Create in me a clean heart" is Psalm
 * 51:12 in the NABRE and 50:12 in the Douay-Rheims. The reader shows that number quietly beside
 * ours, so someone looking up 51:12 from Sunday's readings can still find the verse.
 *
 * The maps come from the import (`server/data/bibles/_remap.mjs` → printedVerseRuns), one small
 * JSON per translation, loaded on demand. Translations not listed print Harvous's numbers.
 */

/** `[chapter, from, to, printedChapter, offset]` as objects, plus the two rarer fields. */
export interface PrintedVerseRun {
  chapter: number;
  from: number;
  to: number;
  printedChapter: number;
  offset: number;
  /** When the edition files the verse under another book (Prayer of Azariah → Daniel). */
  printedBook?: string;
  /** When one Harvous verse holds two printed ones: the last of them. */
  printedTo?: number;
}

export type PrintedVerseMap = Record<string, PrintedVerseRun[]>;

export interface PrintedVerse {
  book: string;
  chapter: number;
  verse: number;
  verseEnd?: number;
}

const LOADERS: Record<string, () => Promise<{ default: PrintedVerseMap }>> = {
  NABRE: () => import('@/data/printed-verse-numbers/NABRE.json'),
  DRB: () => import('@/data/printed-verse-numbers/DRB.json'),
};

export function hasPrintedVerseNumbers(translation: string | null | undefined): boolean {
  return Boolean(translation && LOADERS[translation]);
}

const cache = new Map<string, Promise<PrintedVerseMap>>();

export function loadPrintedVerseMap(translation: string): Promise<PrintedVerseMap> | null {
  const loader = LOADERS[translation];
  if (!loader) return null;
  let pending = cache.get(translation);
  if (!pending) {
    pending = loader().then((m) => m.default);
    cache.set(translation, pending);
  }
  return pending;
}

/** The printed address of a Harvous verse, or null when the edition prints the same one. */
export function printedVerseFor(
  map: PrintedVerseMap,
  book: string,
  chapter: number,
  verse: number,
): PrintedVerse | null {
  const run = map[book]?.find((r) => r.chapter === chapter && r.from <= verse && verse <= r.to);
  if (!run) return null;
  return {
    book: run.printedBook ?? book,
    chapter: run.printedChapter,
    verse: verse + run.offset,
    ...(run.printedTo !== undefined ? { verseEnd: run.printedTo } : {}),
  };
}

/** How the reader writes it beside the verse number: "12", "12–13", "50:12", or "Dn 3:24". */
export function formatPrintedVerse(printed: PrintedVerse, book: string, chapter: number): string {
  const verse = printed.verseEnd !== undefined ? `${printed.verse}–${printed.verseEnd}` : String(printed.verse);
  if (printed.book !== book) return `${printed.book} ${printed.chapter}:${verse}`;
  if (printed.chapter !== chapter) return `${printed.chapter}:${verse}`;
  return verse;
}
