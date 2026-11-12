export const coverColors = [
  { id: 'blue', label: 'Sky', color: 'var(--pds-thread-blue)' },
  { id: 'green', label: 'Leaf', color: 'var(--pds-thread-green)' },
  { id: 'purple', label: 'Lilac', color: 'var(--pds-thread-purple)' },
  { id: 'pink', label: 'Rose', color: 'var(--pds-thread-pink)' },
  { id: 'orange', label: 'Peach', color: 'var(--pds-thread-orange)' },
  { id: 'yellow', label: 'Sun', color: 'var(--pds-thread-yellow)' }
] as const;
export const coverSymbols = ['initial', 'cross', 'leaf', 'sun', 'star', 'book-open', 'puzzle-piece', 'bookmark', 'wand-magic-sparkles',
  // Bible-story stickers: Noah, Jonah, the Spirit as a dove, the King, the mustard seed, hope as an
  // anchor, the storm on the lake, love, prayer.
  'rainbow', 'fish', 'dove', 'crown', 'seedling', 'anchor', 'sailboat', 'heart', 'hands-praying'] as const;
export const coverBindings = ['classic', 'spiral', 'stitched', 'band'] as const;
export const notebookPapers = ['plain', 'lined', 'dotted', 'grid'] as const;
export const coverPatterns = ['plain', 'dots', 'stripes', 'gingham'] as const;
export const childSchemes = ['system', 'light', 'dark'] as const;
export const childTextSizes = ['standard', 'bigger'] as const;
/** Written for young readers. New notebooks start with ERV; these three are offered first. */
export const childBibleTranslations = ['ERV', 'CEV', 'NLV'] as const;
export const legacyChildBibleTranslations = ['BSB', 'NIV', 'NLT'] as const;
/**
 * The rest of the Harvous catalog, which a parent may add instead ("Add translation" in Family Bible
 * settings). The server also checks the text exists in its own database before approving one, since
 * an environment may not carry every translation.
 */
export const familyAddableBibleTranslations = ['BSB', 'NIV', 'NLT', 'KJV', 'NKJV', 'ESV', 'NET', 'NASB', 'CSB', 'AMP', 'MSG', 'NABRE', 'DRB', 'RSV2CE', 'NRSVCE'] as const;
export type ChildBibleTranslation = typeof childBibleTranslations[number] | typeof familyAddableBibleTranslations[number];
export const allChildBibleTranslations = [...childBibleTranslations, ...familyAddableBibleTranslations] as const;

export const CHILD_NOTICE_VERSION = '2026-11-11.2';

export type ChildNotebookPreferences = {
  coverColor: typeof coverColors[number]['id'];
  coverSymbol: typeof coverSymbols[number];
  coverPattern: typeof coverPatterns[number];
  /** Optional so notebooks saved before these existed still read as classic and plain. */
  coverBinding?: typeof coverBindings[number];
  paper?: typeof notebookPapers[number];
  scheme: typeof childSchemes[number];
  textSize: typeof childTextSizes[number];
  reduceMotion: boolean;
  sounds: boolean;
  soundMode?: 'everywhere' | 'moments' | 'off';
  canvas?: string;
  darkCanvas?: string;
};
export const defaultChildPreferences: ChildNotebookPreferences = {
  coverColor: 'blue', coverSymbol: 'initial', coverPattern: 'plain',
  scheme: 'system', textSize: 'standard', reduceMotion: false, sounds: false
};

export type ChildPassage = { book: string; chapter: number; translation: ChildBibleTranslation };
export type ChildFamilyReading = ChildPassage & { id: string };

/** What the parent's toggles list: the young-reader set, then anything already approved or shared. */
export function childBibleTranslationChoices(approved: ChildBibleTranslation[], readings: ChildFamilyReading[]) {
  return [...new Set([...childBibleTranslations, ...approved, ...readings.map(reading => reading.translation)])];
}
export type ChildFamilyThought = { id: string; verse: number; role: 'parent' | 'child'; text: string };
export type ChildBibleChapter = { verses: { verse: number; text: string }[] };
export type ChildFamilyChapter = ChildFamilyReading & ChildBibleChapter & { thoughts: ChildFamilyThought[] };
