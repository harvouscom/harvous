import { coverSymbols } from './child-notebook';

/**
 * Stickers a child can put beside a verse in My Bible. The same die-cut set as the notebook
 * cover, minus the child's initial (a letter is a cover thing, not a verse thing), so a new
 * cover sticker shows up here without a second list to keep in step.
 *
 * Private to the child: never shown in the parent's Family Bible view, but included in the
 * parent's export and removed with the child's account (FK cascade on FamilyChildren).
 */
export const verseStickers = coverSymbols.filter(
  (symbol): symbol is Exclude<typeof coverSymbols[number], 'initial'> => symbol !== 'initial'
);
export type VerseSticker = typeof verseStickers[number];
export type ChildVerseSticker = { verse: number; sticker: VerseSticker };

/** A child stays well clear of this; it only stops a runaway client filling the table. */
export const VERSE_STICKER_LIMIT = 2000;

const names: Partial<Record<string, string>> = {
  'book-open': 'Bible', 'puzzle-piece': 'puzzle', 'wand-magic-sparkles': 'sparkles', 'hands-praying': 'praying hands'
};
export function verseStickerLabel(sticker: string) {
  const label = names[sticker] ?? sticker.replaceAll('-', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}
