/**
 * Selecting several notes without a mode to enter first.
 *
 * A selection begins the moment one note is picked — by its hover checkbox or a
 * ⌘-click — and ends when the last one is dropped. There is no "select mode" to
 * turn on, which is why these are pure functions over the current set rather
 * than transitions of a state machine.
 */

/** Ceiling matched to `copy-notes`' server-side `.slice(0, 50)`. */
export const NOTE_SELECTION_CAP = 50;

export function toggleNoteSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((n) => n !== id)
    : [...selected, id].slice(0, NOTE_SELECTION_CAP);
}

/**
 * Shift-click: everything between the last note touched and this one.
 *
 * **Union, not replace.** A range extends what you already hold rather than
 * discarding it — someone who ⌘-clicked four scattered notes and then
 * shift-clicked a run meant to add the run, and replacing would silently throw
 * away the harder-won half of the selection.
 *
 * With no anchor yet — shift-click as the opening gesture — there is no range to
 * take, so it degrades to selecting the one note rather than doing nothing.
 */
export function extendNoteSelectionRange(input: {
  selected: readonly string[];
  /** Rows as listed, in list order. */
  orderedIds: readonly string[];
  /** The last row toggled, or null before anything has been. */
  anchorId: string | null;
  targetId: string;
}): string[] {
  const { selected, orderedIds, anchorId, targetId } = input;

  const to = orderedIds.indexOf(targetId);
  const from = anchorId ? orderedIds.indexOf(anchorId) : -1;
  if (to === -1 || from === -1) return toggleNoteSelection(selected, targetId);

  const [lo, hi] = from <= to ? [from, to] : [to, from];
  const next = [...selected];
  for (const id of orderedIds.slice(lo, hi + 1)) {
    if (!next.includes(id)) next.push(id);
  }
  return next.slice(0, NOTE_SELECTION_CAP);
}
