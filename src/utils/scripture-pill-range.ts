/**
 * Range helpers for scripture pills that need reliable mark detection.
 *
 * ProseMirror's `$pos.marks()` / `nodeBefore` / `nodeAfter` are unreliable at the boundaries of
 * non-inclusive marks like `scripturePill` (see project notes), so for range-level questions we
 * inspect nodes directly via `nodesBetween` instead of resolving positions.
 */

/**
 * True if any node in `[from, to)` of `doc` carries a `scripturePill` mark.
 *
 * Used as a data-loss guard before creating a brand-new pill over a text range: if the range already
 * contains a pill (e.g. typing the same chapter reference a second time resolved back onto the first
 * pill), creating a fresh pill there would `replaceWith` over and destroy the existing one.
 *
 * Positions are clamped to the document bounds so a stale/over-shot range can never throw.
 */
export function rangeContainsScripturePillMark(doc: any, from: number, to: number): boolean {
  if (!doc) return false;
  const size = doc.content.size;
  const start = Math.max(0, Math.min(from, size));
  const end = Math.max(start, Math.min(to, size));
  if (end <= start) return false;

  let found = false;
  doc.nodesBetween(start, end, (node: any) => {
    if (found) return false;
    if (node?.marks?.some((m: any) => m.type.name === 'scripturePill')) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

const nodeIsPill = (node: any): boolean =>
  !!node?.marks?.some((m: any) => m.type.name === 'scripturePill');

/**
 * Where a left-arrow keypress should drop the caret to cross a scripture pill in ONE press, or null
 * when no pill is immediately to the left.
 *
 * Pills are atomic and carry an invisible trailing formatting space, so from "the right of the pill"
 * the caret may sit either flush against the pill OR after that spacer. The spacer reads as part of
 * the pill box, so without this a left-arrow looks like it does nothing (it only crosses the spacer).
 * Treating `pill (+ optional single trailing space)` as one unit returns the position just before the
 * pill so ArrowLeft lands left of it in a single keystroke.
 */
export function scripturePillSkipLeftTarget(doc: any, from: number): number | null {
  if (!doc || from <= 0) return null;
  const $from = doc.resolve(from);
  const parent = $from.parent;
  const parentOffset = $from.parentOffset;
  // The caret can never land before the start of its own text block — bound the scan there so a pill
  // at the block start resolves to the block's content start (not doc position 0).
  const blockStart = $from.start($from.depth);

  // Probe a position known to be INSIDE the pill that sits to the left of the caret.
  let probe: number | null = null;
  const before = parent.childBefore(parentOffset);
  if (before.node && before.offset + before.node.nodeSize === parentOffset && nodeIsPill(before.node)) {
    probe = from - 1; // pill flush against the caret
  } else {
    let charBefore = '';
    try {
      charBefore = doc.textBetween(from - 1, from);
    } catch {
      /* boundary — leave empty */
    }
    if (charBefore === ' ' && from - 2 >= 0 && nodeIsPill(doc.resolve(from - 1).nodeBefore)) {
      probe = from - 2; // a single spacer, then the pill
    }
  }
  if (probe == null || probe < blockStart) return null;

  // Walk left to the pill's start boundary (mirrors findPillBoundaries' start scan; nodeAfter catches
  // the inclusive:false left boundary that $pos.marks() misses).
  for (let p = probe; p >= blockStart; p--) {
    if (p === blockStart) return blockStart;
    const $p = doc.resolve(p);
    const here = $p.marks().some((m: any) => m.type.name === 'scripturePill');
    if (!here && !nodeIsPill($p.nodeAfter)) return p + 1;
  }
  return blockStart;
}
