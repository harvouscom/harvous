import { coverSymbols } from './child-notebook';

/**
 * Stickers anyone can put beside a verse: in a child's My Bible and in the Harvous Bible reader.
 * The same die-cut set as the child notebook cover, minus the child's initial (a letter is a
 * cover thing, not a verse thing), so a new cover sticker shows up in both readers without a
 * second list to keep in step. One set on purpose: a child's stickers move into their own
 * account at 13 and have to mean the same thing there.
 */
export const verseStickers = coverSymbols.filter(
  (symbol): symbol is Exclude<typeof coverSymbols[number], 'initial'> => symbol !== 'initial'
);
export type VerseSticker = typeof verseStickers[number];

/**
 * More for grown-ups: themes rather than pictures, for the deeper things a verse can be about.
 * The adult reader offers these after the shared set. A child's My Bible never does, so every
 * child sticker is still one the reader knows when a notebook moves into a teen's own account,
 * and nothing ever has to move the other way.
 */
export const readerOnlyStickers = [
  'scale-balanced', 'scroll', 'fire-flame-curved', 'droplet', 'bread-slice', 'wine-glass',
  'key', 'shield-halved', 'mountain', 'road', 'tree', 'church',
  'handshake', 'hand-holding-heart', 'hourglass-half', 'lightbulb', 'question', 'cloud-rain',
] as const;
export type ReaderOnlySticker = typeof readerOnlyStickers[number];
/** Everything the adult reader offers: its themes first, then the stickers it shares with child notebooks. */
export const readerStickers = [...readerOnlyStickers, ...verseStickers] as const;
export type ReaderSticker = VerseSticker | ReaderOnlySticker;

export function isReaderSticker(value: unknown): value is ReaderSticker {
  return typeof value === 'string' && (readerStickers as readonly string[]).includes(value);
}

const names: Partial<Record<string, string>> = {
  'book-open': 'Bible', 'puzzle-piece': 'puzzle', 'wand-magic-sparkles': 'sparkles', 'hands-praying': 'praying hands',
  'scale-balanced': 'justice', 'fire-flame-curved': 'fire', droplet: 'water', 'bread-slice': 'bread', 'wine-glass': 'cup',
  'shield-halved': 'shield', road: 'the way', handshake: 'covenant', 'hand-holding-heart': 'mercy',
  'hourglass-half': 'waiting', lightbulb: 'insight', 'cloud-rain': 'lament'
};
export function verseStickerLabel(sticker: string) {
  const label = names[sticker] ?? sticker.replaceAll('-', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Each sticker's own colour in the adult reader, from the Thread palette. A child's stickers take
 * their notebook's cover colour; an adult reader has no cover, so the sticker carries one. Fixed
 * per sticker rather than chosen, so a fish is always the same blue wherever it is stuck.
 */
export type VerseStickerTone = 'blue' | 'green' | 'purple' | 'pink' | 'orange' | 'yellow';
export const verseStickerTones: Record<ReaderSticker, VerseStickerTone> = {
  cross: 'purple', leaf: 'green', sun: 'yellow', star: 'purple', 'book-open': 'blue', 'puzzle-piece': 'orange',
  bookmark: 'pink', 'wand-magic-sparkles': 'purple', rainbow: 'pink', fish: 'blue', dove: 'blue', crown: 'green',
  seedling: 'green', anchor: 'blue', sailboat: 'blue', heart: 'orange', 'hands-praying': 'yellow',
  'scale-balanced': 'purple', scroll: 'yellow', 'fire-flame-curved': 'orange', droplet: 'blue', 'bread-slice': 'yellow',
  'wine-glass': 'pink', key: 'yellow', 'shield-halved': 'blue', mountain: 'green', road: 'orange', tree: 'green',
  church: 'purple', handshake: 'orange', 'hand-holding-heart': 'pink', 'hourglass-half': 'yellow', lightbulb: 'yellow',
  question: 'purple', 'cloud-rain': 'blue'
};

/** Hand-placed angles, picked from the verse rather than at random, so a sticker sits the same way every time. */
export const verseStickerTilts = [-6, 4, -3, 7, -5, 3, -7, 5, -2] as const;
export const verseStickerTilt = (verse: number, chapter: number) =>
  verseStickerTilts[(verse * 7 + chapter) % verseStickerTilts.length];

/** Nobody reaches this by hand; it only stops a runaway client filling the table. */
export const VERSE_STICKER_LIMIT = 2000;
