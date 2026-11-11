export const coverColors = [
  { id: 'blue', label: 'Sky', color: 'var(--pds-thread-blue)' },
  { id: 'green', label: 'Meadow', color: 'var(--pds-thread-green)' },
  { id: 'purple', label: 'Lilac', color: 'var(--pds-thread-purple)' },
  { id: 'pink', label: 'Rose', color: 'var(--pds-thread-pink)' },
  { id: 'orange', label: 'Peach', color: 'var(--pds-thread-orange)' },
  { id: 'yellow', label: 'Sunshine', color: 'var(--pds-thread-yellow)' }
] as const;
export const coverSymbols = ['initial', 'cross', 'leaf', 'sun', 'star', 'book-open', 'puzzle-piece', 'bookmark', 'wand-magic-sparkles'] as const;
export const coverPatterns = ['plain', 'dots', 'stripes', 'gingham'] as const;
export const childSchemes = ['system', 'light', 'dark'] as const;
export const childTextSizes = ['standard', 'bigger'] as const;
export const childBibleTranslations = ['BSB', 'NIV', 'NLT'] as const;
export type ChildBibleTranslation = typeof childBibleTranslations[number];

export type ChildNotebookPreferences = {
  coverColor: typeof coverColors[number]['id'];
  coverSymbol: typeof coverSymbols[number];
  coverPattern: typeof coverPatterns[number];
  scheme: typeof childSchemes[number];
  textSize: typeof childTextSizes[number];
  reduceMotion: boolean;
  sounds: boolean;
};
export const defaultChildPreferences: ChildNotebookPreferences = {
  coverColor: 'blue', coverSymbol: 'initial', coverPattern: 'plain',
  scheme: 'system', textSize: 'standard', reduceMotion: false, sounds: false
};

export type ChildPassage = { book: string; chapter: number; translation: ChildBibleTranslation };
export type ChildFamilyReading = ChildPassage & { id: string };
export type ChildFamilyThought = { id: string; verse: number; role: 'parent' | 'child'; text: string };
export type ChildBibleChapter = { verses: { verse: number; text: string }[] };
export type ChildFamilyChapter = ChildFamilyReading & ChildBibleChapter & { thoughts: ChildFamilyThought[] };
