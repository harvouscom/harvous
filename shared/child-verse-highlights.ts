/**
 * Highlighter colours a child can use in My Bible: the reader's own five, so a child's highlight
 * looks like any other Harvous highlight.
 *
 * Private to the child: never shown in the parent's Family Bible view, but included in the
 * parent's export and removed with the child's account (FK cascade on FamilyChildren).
 */
export const verseHighlightColors = ['warmAmber', 'mintGreen', 'skyBlue', 'violet', 'coralRose'] as const;
export type VerseHighlightColor = typeof verseHighlightColors[number];
export type ChildVerseHighlight = { verse: number; color: VerseHighlightColor };

/** A child stays well clear of this; it only stops a runaway client filling the table. */
export const VERSE_HIGHLIGHT_LIMIT = 5000;

const names: Record<VerseHighlightColor, string> = { warmAmber: 'Sunny', mintGreen: 'Mint', skyBlue: 'Sky', violet: 'Grape', coralRose: 'Rose' };
export const verseHighlightLabel = (color: string) => names[color as VerseHighlightColor] ?? color;
