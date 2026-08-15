/**
 * When does a paper stack stop being true?
 *
 * The stack is shell state, not route state, so nothing clears it for free — and for a while
 * nothing cleared it at all: once you had stacked a note over the reader, the reader stayed
 * mounted behind every route you visited afterwards, and whatever the router rendered next
 * became "the sheet". This module is the one place that decides, from a navigation, whether
 * the stack still describes where you are.
 *
 * Pure so the whole verdict table can be tested without a router. The layout owns the
 * effect; this owns the rules.
 */

import type { PaperStackState } from '../../layouts/proto-shell-context';

export type PaperStackVerdict = 'keep' | 'clear' | { adoptNoteId: string };

export type PaperStackPathHelpers = {
  isNotePath: (pathname: string) => boolean;
  /** Canonical note id at this path, or null. Must decode the URL slug, not return it raw. */
  noteIdAt: (pathname: string) => string | null;
  isReadPath: (pathname: string) => boolean;
  isHomePath: (pathname: string) => boolean;
};

/**
 * Decide what a navigation to `pathname` means for the stack.
 *
 * The three origin kinds are the same pattern in different directions, and the rules mirror
 * that rather than special-casing surfaces:
 *
 * - `reader` (reader is the base, a note is the sheet): the note's own path keeps it, and so
 *   does any chapter — flipping down and reading on a few chapters before flipping back up
 *   is exactly the behaviour the stack exists for. A *different* note clears it: that is a
 *   new document, and it did not come from this reader.
 * - `homeCard` (a Home card is the origin, a note is the sheet): the note keeps it, Home
 *   keeps it (that is where flip-down goes), everything else clears it. Notably a chapter
 *   clears it — the reader is its own base, not something Home stands behind.
 * - `noteDock` (a note is the origin, the reader is the sheet): any chapter keeps it, since
 *   the reader wanders; landing back on the origin note *without* going through the edge
 *   (browser back) means the stack is over — the note is on screen, so there is nothing to
 *   return to.
 *
 * A compose draft stacks with no note id and gets one when it saves; the save navigation
 * arrives here as a note path with no id on the stack, and that is the one case that
 * *adopts* rather than keeps or clears. Only `reader` and `homeCard` can be composing —
 * a `noteDock` origin is by definition an existing note.
 */
export function resolvePaperStackAfterNavigation(
  stack: PaperStackState | null,
  pathname: string,
  helpers: PaperStackPathHelpers,
): PaperStackVerdict {
  if (!stack) return 'keep';
  const { origin, noteId } = stack;

  if (origin.kind === 'noteDock') {
    return helpers.isReadPath(pathname) ? 'keep' : 'clear';
  }

  if (helpers.isNotePath(pathname)) {
    const atPath = helpers.noteIdAt(pathname);
    if (!atPath) return 'keep';
    if (!noteId) return { adoptNoteId: atPath };
    return atPath === noteId ? 'keep' : 'clear';
  }

  if (origin.kind === 'reader') {
    return helpers.isReadPath(pathname) ? 'keep' : 'clear';
  }

  // homeCard
  return helpers.isHomePath(pathname) ? 'keep' : 'clear';
}
