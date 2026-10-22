/**
 * Where flipping a parked note back up should take the URL.
 *
 * The edge is the note's own label, so tapping it promises the note. Flip-down records the
 * sheet's address on the stack (`parkedAt`) when it had one to leave; that is the answer
 * whenever it is there. It is absent in two cases that look alike from the stack and are not:
 *
 * - A compose draft that never left the origin. It has no address and no id; it simply
 *   reappears, because the layout hosts the draft on the origin's own path.
 * - A note that was already standing on its origin's URL when it went down — its scripture
 *   dock fell back to the chapter it was opened from, say. It HAS an id. Opening the sheet
 *   without navigating left the URL on `/read/...`, where the layout stops hosting the note
 *   and the Outlet renders the chapter, so the tap read as "dismiss": the note vanished and
 *   the reader that was already behind it stayed. Its own route is where it lives.
 *
 * Pure so the rule can be tested without a router; the layout supplies the path helpers and
 * builds the note route.
 */

import type { PaperStackReturnTo, PaperStackState } from '../../layouts/proto-shell-context';

export type PaperStackFlipHelpers = {
  /** Canonical note id at this path, or null. */
  noteIdAt: (pathname: string) => string | null;
  /** The note's own route, carrying whatever search the current page should keep. */
  noteRoute: (noteId: string) => PaperStackReturnTo;
};

export function resolvePaperStackFlipUp(
  stack: PaperStackState | null,
  pathname: string,
  helpers: PaperStackFlipHelpers,
): PaperStackReturnTo | null {
  // A chapter sheet never parks, and a dock-expanded reader collapses instead of flipping.
  if (!stack || stack.sheet || stack.origin.kind === 'noteDock') return null;
  if (stack.parkedAt) return stack.parkedAt;
  if (!stack.noteId) return null;
  if (helpers.noteIdAt(pathname) === stack.noteId) return null;
  return helpers.noteRoute(stack.noteId);
}
