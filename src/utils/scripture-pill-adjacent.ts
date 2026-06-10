/**
 * Find scripture pill boundaries adjacent to a cursor for delete-confirm UX.
 */

export function findAdjacentPillBoundaries(
  doc: any,
  pos: number,
  direction: 'before' | 'after',
): { start: number; end: number } | null {
  try {
    const $pos = doc.resolve(pos);
    const parent = $pos.parent;
    const parentStart = $pos.start($pos.depth);

    if (direction === 'before') {
      let offset = 0;
      let lastPillStart = -1;
      let lastPillEnd = -1;

      for (let i = 0; i < parent.childCount; i++) {
        const child = parent.child(i);
        const childStart = parentStart + offset;
        const childEnd = childStart + child.nodeSize;

        if (child.marks.some((m: any) => m.type.name === 'scripturePill')) {
          if (lastPillEnd === childStart) {
            lastPillEnd = childEnd;
          } else {
            lastPillStart = childStart;
            lastPillEnd = childEnd;
          }
        }

        if (childEnd >= pos) break;
        offset += child.nodeSize;
      }

      if (lastPillStart >= 0 && lastPillEnd > 0) {
        const gap = pos - lastPillEnd;
        if (gap === 0 || gap === 1) {
          const gapText = pos > lastPillEnd ? doc.textBetween(lastPillEnd, pos) : '';
          if (!gapText || gapText === ' ' || gapText === '\n' || gapText === '\t') {
            return { start: lastPillStart, end: pos };
          }
        }
      }
    }

    if (direction === 'after') {
      let offset = 0;

      for (let i = 0; i < parent.childCount; i++) {
        const child = parent.child(i);
        const childStart = parentStart + offset;
        const childEnd = childStart + child.nodeSize;

        if (childStart >= pos && child.marks.some((m: any) => m.type.name === 'scripturePill')) {
          let pillEnd = childEnd;
          for (let j = i + 1; j < parent.childCount; j++) {
            const next = parent.child(j);
            if (next.marks.some((m: any) => m.type.name === 'scripturePill')) {
              pillEnd = parentStart + offset + child.nodeSize;
              let o2 = 0;
              for (let k = 0; k <= j; k++) o2 += parent.child(k).nodeSize;
              pillEnd = parentStart + o2;
            } else break;
          }
          return { start: pos, end: pillEnd };
        }

        if (childStart > pos + 1) break;
        offset += child.nodeSize;
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}
