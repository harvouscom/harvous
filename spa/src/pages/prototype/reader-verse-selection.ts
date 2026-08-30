/**
 * What tapping a verse does to the reader's current selection.
 *
 * Pulled out of `PrototypeBibleReaderPane` because it is the whole interaction rule for
 * choosing a passage, and a rule that lives inside a `setState` updater cannot be read or
 * tested without mounting a chapter.
 *
 * `extend` is shift-click. It used to be the *only* way to select more than one verse, which
 * made every multi-verse action desktop-only: touch has no shift key, so a phone could never
 * select the two or three verses almost anything worth acting on actually spans.
 */

/**
 * Which of the two texts a verse belongs to.
 *
 * There is one column until the reader opens a comparison, and then there are two — the same
 * chapter in two translations, aligned by verse number. `primary` is the translation the page
 * is in and the only one that exists when nothing is being compared.
 */
export type ReaderColumn = 'primary' | 'compare';

export type VerseSelection = { start: number; end: number; column: ReaderColumn } | null;

export function nextVerseSelection(
  current: VerseSelection,
  num: number,
  extend: boolean,
  column: ReaderColumn,
): VerseSelection {
  const fresh = { start: num, end: num, column };
  if (!current) return fresh;
  /*
   * A tap in the other version starts over rather than reaching across, and shift does not
   * change that.
   *
   * A range spanning both columns would be half one translation and half another, and every
   * action downstream asks the selection for one thing: the text it covers. There is no honest
   * answer to that across two versions — a highlight is *of* a text, and the row it writes
   * carries the translation it was made in. So crossing is a new selection, not a wider one.
   */
  if (current.column !== column) return fresh;
  const { start, end } = current;
  // The sole selected verse, tapped again — the way back out of a selection.
  if (start === num && end === num) return null;
  // Inside a range — narrow to the verse actually pointed at, so an overshoot is one tap to
  // fix rather than a deselect-and-start-again. Shift skips this: it only ever extends.
  if (!extend && num >= start && num <= end) return { start: num, end: num, column };
  return { start: Math.min(start, num), end: Math.max(end, num), column };
}
