/** Types for remap.mjs (plain JS so the import scripts run under bare `node`). */

export type Versification = 'org' | 'vul';

export interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

export interface SourceVerse extends VerseRef {
  text: string;
}

export interface RemapReport {
  titlesDropped: number;
  outsideCanon: string[];
  moved: string[];
  joined: string[];
  missing: string[];
}

export interface VersificationSource {
  versification: Versification;
  books: Record<string, Versification>;
  chapterMaps: Record<string, Record<number, [number, number] | null>>;
  verseShifts?: Record<string, number>;
  cleanText?: (text: string, book: string) => string;
  alignWith?: string;
}

export const USFM_BOOKS: string[];
export const SOURCES: Record<string, VersificationSource>;
export function parseVrsMappings(text: string): Map<string, string[]>;
export function englishCandidates(book: string, chapter: number, verse: number, versification: Versification): VerseRef[];
export function cleanNabreText(text: string, book: string): string;
export function stems(text: string): Set<string>;
export function remapVerses(
  raw: SourceVerse[],
  translationId: string,
  options?: { reference?: SourceVerse[] },
): { verses: SourceVerse[]; report: RemapReport };
