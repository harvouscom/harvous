import type { VerseSticker } from './verse-stickers';

/**
 * Stickers a child can put beside a verse in My Bible — the same set as the adult reader's
 * (`./verse-stickers`), so they carry over unchanged when the notebook moves into the young
 * person's own account at 13.
 *
 * Private to the child: never shown in the parent's Family Bible view, but included in the
 * parent's export and removed with the child's account (FK cascade on FamilyChildren).
 */
export { verseStickers, verseStickerLabel, VERSE_STICKER_LIMIT, type VerseSticker } from './verse-stickers';
export type ChildVerseSticker = { verse: number; sticker: VerseSticker };
