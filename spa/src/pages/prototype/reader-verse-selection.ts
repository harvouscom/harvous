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
export type VerseSelection = [number, number] | null;

export function nextVerseSelection(
  current: VerseSelection,
  num: number,
  extend: boolean,
): VerseSelection {
  if (!current) return [num, num];
  const [start, end] = current;
  // The sole selected verse, tapped again — the way back out of a selection.
  if (start === num && end === num) return null;
  // Inside a range — narrow to the verse actually pointed at, so an overshoot is one tap to
  // fix rather than a deselect-and-start-again. Shift skips this: it only ever extends.
  if (!extend && num >= start && num <= end) return [num, num];
  return [Math.min(start, num), Math.max(end, num)];
}
