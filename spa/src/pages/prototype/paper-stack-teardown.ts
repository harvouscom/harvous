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
import { READER_DESTINED_CARD_KINDS } from './paper-stack-origins';

export type PaperStackVerdict = 'keep' | 'clear' | { adoptNoteId: string };

export type PaperStackPathHelpers = {
  isNotePath: (pathname: string) => boolean;
  /** Canonical note id at this path, or null. Must decode the URL slug, not return it raw. */
  noteIdAt: (pathname: string) => string | null;
  isReadPath: (pathname: string) => boolean;
  /** Which chapter a read path points at, so "the same chapter" can be told from "another". */
  readTargetAt: (pathname: string) => { book: string; chapter: number } | null;
  isHomePath: (pathname: string) => boolean;
};

/**
 * Decide what a navigation to `pathname` means for the stack.
 *
 * The three origin kinds are the same pattern in different directions, and the rules mirror
 * that rather than special-casing surfaces:
 *
 * - `reader` (reader is the base, a note is the sheet): the note's own path keeps it. A
 *   chapter keeps it only while the note is PARKED — flipping down and reading on a few
 *   chapters before flipping back up is exactly what the stack exists for. With the note
 *   still UP, a chapter means you have left the note behind, so the stack goes with it. That
 *   distinction was missing, and the cost was not a stale breadcrumb: the sheet renders the
 *   route, so keeping the stack swapped your note for a second reader — two chapters, one
 *   behind the other, and the draft the stack had promised to hold simply unmounted.
 *   A *different* note clears it: that is a new document, and it did not come from here.
 * - `homeCard` (a Home card is the origin, a note is the sheet): the note keeps it, Home
 *   keeps it (that is where flip-down goes), everything else clears it. Notably a chapter
 *   clears it — the reader is its own base, not something Home stands behind.
 * - `noteDock` (a note is the origin, the reader is the sheet): any chapter keeps it, since
 *   the reader wanders; landing back on the origin note *without* going through the edge
 *   (browser back) means the stack is over — the note is on screen, so there is nothing to
 *   return to.
 * - `reviewCard` (a review question is the origin, the note it asks about is the sheet): only
 *   that note keeps it. There is no way back to a card — the dock is still on screen — so the
 *   edge exists solely to be answered, and it has no business over any other page.
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
  const { origin, noteId, open } = stack;

  if (origin.kind === 'noteDock') {
    return helpers.isReadPath(pathname) ? 'keep' : 'clear';
  }

  /*
   * Before the generic note branch below, which would be wrong here in one specific way: that
   * branch keeps the stack on a note path with no resolvable id (a compose draft) so a save can
   * adopt it. A review card never stacks a draft — it stacks an existing note it named — so a
   * path it cannot resolve means the reader has gone somewhere else entirely, and the question
   * should not follow them there as an edge over an unrelated page. The dock still has it.
   */
  if (origin.kind === 'reviewCard') {
    if (!helpers.isNotePath(pathname)) return 'clear';
    const atPath = helpers.noteIdAt(pathname);
    return atPath && atPath === noteId ? 'keep' : 'clear';
  }

  if (helpers.isNotePath(pathname)) {
    const atPath = helpers.noteIdAt(pathname);
    if (!atPath) return 'keep';
    if (!noteId) return { adoptNoteId: atPath };
    return atPath === noteId ? 'keep' : 'clear';
  }

  if (origin.kind === 'reader') {
    if (!helpers.isReadPath(pathname)) return 'clear';
    // Parked, the base IS the reader being browsed, so any chapter is the same session.
    if (!open) return 'keep';
    /*
     * Still up, and the sheet renders the route — so a read path here would put a chapter
     * where the note is. Exactly one shape survives that: a compose draft that has not moved.
     * A draft started from a verse opens on the reader's own address and never navigates, so
     * it has no note id yet and it is still on the origin's chapter. Anything else — a saved
     * note, or a draft carried to another chapter — is a real navigation away from the note.
     */
    if (noteId) return 'clear';
    const at = helpers.readTargetAt(pathname);
    const base = origin.base.type === 'reader' ? origin.base : null;
    if (!at || !base) return 'clear';
    return at.book === base.book && at.chapter === base.chapter ? 'keep' : 'clear';
  }

  // homeCard
  if (helpers.isHomePath(pathname)) return 'keep';
  /*
   * A chapter normally ends a Home card's stack — the reader is its own base. The exception
   * is a card that opened the reader on purpose: then the chapter under the edge is exactly
   * what the card promised, and clearing would drop the only thing on screen saying why this
   * passage is open.
   */
  if (helpers.isReadPath(pathname) && READER_DESTINED_CARD_KINDS.has(origin.cardKind ?? '')) {
    return 'keep';
  }
  return 'clear';
}
