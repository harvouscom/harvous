/**
 * What the toolbar's center chip says: Search, always.
 *
 * It began as a note-only folder chip, then briefly became a context statement that named
 * your folder on a note and your book in the reader. That second version was wrong for a
 * reason worth writing down: the note's folders live in its inspector and the chapter is
 * the thing you are looking at, so the chip was repeating what the surface already said —
 * and paying for it with a label that changed width on every navigation, in a control that
 * is absolutely centred in the toolbar.
 *
 * One word, one glyph, one width. The chip is a door, and a door does not need to describe
 * the room you are standing in.
 *
 * Kept as a module rather than a literal because the two rules below still have to hold,
 * and a rule with nowhere to live is a rule that gets broken:
 *
 *   1. **Never unmount.** The chip is absolutely centred; one that came and went would make
 *      the toolbar twitch, and one absent on Activity leaves a fresh session with no way in.
 *   2. **Say what expanding will show.** `libraryOpeningView` opens the same surface this
 *      names. They agree by construction now, which is the point of collapsing the variants.
 */

/** Mirrors `ShellMode` from `useShellModeNav`, kept structural so this stays pure. */
export type LibraryChipMode = 'activity' | 'note' | 'reader';

export type LibraryChipDisplay = {
  label: string;
  icon: 'search';
  ariaLabel: string;
};

export const LIBRARY_CHIP_NEUTRAL_LABEL = 'Search';

/**
 * Takes the mode it no longer branches on.
 *
 * Deliberate: the caller has it, the shape is the one place this could ever need to differ
 * again, and a parameterless function would have to grow the parameter back. Keeping it
 * costs nothing and documents that the sameness is a decision rather than an oversight.
 */
export function resolveLibraryChipDisplay(_input: { mode: LibraryChipMode }): LibraryChipDisplay {
  return {
    label: LIBRARY_CHIP_NEUTRAL_LABEL,
    icon: 'search',
    ariaLabel: 'Open search',
  };
}
