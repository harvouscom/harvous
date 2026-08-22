/**
 * The margin's signal, for anyone not looking at it.
 *
 * The bars are `aria-hidden` and stay that way — a screen reader walking a chapter should hear
 * Scripture, not a list of marks interleaved between verses. The consequence, until this landed,
 * was that nothing *volunteered* the fact that you had written about a verse: the verse's own
 * actions are Highlight / Annotate / Passages / Note, and the notes were reachable only by opening
 * the passage dock, which you had to already suspect was worth doing.
 *
 * Tested through `assignAnchorLanes` and the label rather than by rendering the pane, because the
 * thing that must hold is the mapping from anchors to per-verse counts. The pane needs a chapter
 * query, a shell context and a measured layout to render at all, none of which is what this is
 * about.
 */
import { describe, expect, it } from 'vitest';
import { assignAnchorLanes } from '../../../hooks/queries/usePrototypeChapterNotes';

/** Mirrors the derivation in `PrototypeBibleReaderPane`'s `noteCountByVerse`. */
function noteCountByVerse(anchors: Parameters<typeof assignAnchorLanes>[0], verseCount: number) {
  const counts = new Map<number, number>();
  for (const lane of assignAnchorLanes(anchors, verseCount)) {
    for (let v = lane.startVerse; v <= lane.endVerse; v++) {
      counts.set(v, (counts.get(v) ?? 0) + lane.mergedCount);
    }
  }
  return counts;
}

const anchor = (verse: number, verseEnd: number, noteId = `n${verse}-${verseEnd}`) => ({
  noteId,
  title: 'A note',
  reference: `John 1:${verse}-${verseEnd}`,
  verse,
  verseEnd,
  // Null: these anchors stay inside the chapter. A non-null `chapterEnd` is the cross-chapter
  // case, which `assignAnchorLanes` clamps to the last verse shown and is covered elsewhere.
  chapterEnd: null,
  updatedAt: '2026-08-21T00:00:00.000Z',
});

describe('a verse knows how many notes cite it', () => {
  it('counts every verse an anchor covers, not just where it starts', () => {
    const counts = noteCountByVerse([anchor(3, 5)], 20);
    expect(counts.get(2)).toBeUndefined();
    expect(counts.get(3)).toBe(1);
    expect(counts.get(4)).toBe(1);
    expect(counts.get(5)).toBe(1);
    expect(counts.get(6)).toBeUndefined();
  });

  it('adds up where notes overlap', () => {
    const counts = noteCountByVerse([anchor(1, 3), anchor(2, 4)], 20);
    expect(counts.get(1)).toBe(1);
    expect(counts.get(2)).toBe(2);
    expect(counts.get(4)).toBe(1);
  });

  /**
   * Two notes citing exactly the same verses share one bar, and the count must follow the notes
   * rather than the bars — otherwise "in 2 of your notes" would read "in one of your notes".
   */
  it('counts notes, not bars, when two share a span', () => {
    const counts = noteCountByVerse([anchor(7, 7, 'a'), anchor(7, 7, 'b')], 20);
    expect(counts.get(7)).toBe(2);
  });

  /**
   * A note folded past the three-lane cap has no bar of its own, and the host bar no longer
   * stretches over it. The count still has to include it — the host speaks for both.
   */
  it('includes a note that merged past the lane cap', () => {
    const counts = noteCountByVerse(
      [anchor(1, 6), anchor(2, 7), anchor(3, 8), anchor(4, 12)],
      20,
    );
    // Four notes cover verse 4; three have bars and the fourth folded into the innermost.
    expect(counts.get(4)).toBe(4);
  });

  it('says nothing about a chapter nobody has written on', () => {
    expect(noteCountByVerse([], 20).size).toBe(0);
  });
});
