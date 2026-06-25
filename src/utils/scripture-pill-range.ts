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
