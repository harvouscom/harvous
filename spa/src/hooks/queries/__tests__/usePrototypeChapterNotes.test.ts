import { describe, expect, it } from 'vitest';
import { assignAnchorLanes, type ChapterNoteAnchor } from '../usePrototypeChapterNotes';

/** Minimal anchor; only the span fields matter to lane assignment. */
function anchor(
  verse: number,
  verseEnd: number | null = null,
  extra: Partial<ChapterNoteAnchor> = {},
): ChapterNoteAnchor {
  return {
    noteId: `n${verse}-${verseEnd ?? verse}`,
    reference: `Exodus 17:${verse}${verseEnd ? `-${verseEnd}` : ''}`,
    verse,
    verseEnd,
    chapterEnd: null,
    title: null,
    updatedAt: null,
    ...extra,
  };
}

describe('assignAnchorLanes', () => {
  it('gives a single-verse note a one-verse bar', () => {
    const [bar] = assignAnchorLanes([anchor(4)], 20);
    expect(bar).toMatchObject({ startVerse: 4, endVerse: 4, lane: 0, mergedCount: 1 });
    expect(bar.notes).toHaveLength(1);
  });

  it('collapses notes citing the exact same verses into one bar', () => {
    // Two notes about Exodus 17:1-3 are two notes on one passage, not an overlap. Separate
    // bars would take two lanes and read as two different ranges.
    const bars = assignAnchorLanes(
      [
        anchor(1, 3, { noteId: 'a', title: 'First' }),
        anchor(1, 3, { noteId: 'b', title: 'Second' }),
        anchor(1, 3, { noteId: 'c', title: 'Third' }),
      ],
      20,
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].lane).toBe(0);
    expect(bars[0].mergedCount).toBe(3);
    expect(bars[0].notes.map((n) => n.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('keeps each note\'s own reference even when they share a bar', () => {
    // Regression: the bar used to expose one `reference` (the first anchor's) for every
    // note on it, so opening the *second* note navigated with the *first* note's reference
    // — a pill that does not exist in that document, which sent the reader to the
    // standalone-passage fallback instead of that note's own scripture dock. Each note must
    // carry its own reference even when its span collapsed into a shared bar, because
    // different underlying citations (a single verse vs. the range that contains it) can
    // still collapse to the same clamped verse span.
    const bars = assignAnchorLanes(
      [
        anchor(1, 3, { noteId: 'a', title: 'First', reference: 'Exodus 17:1-3' }),
        anchor(1, 3, { noteId: 'b', title: 'Second', reference: 'Exodus 17:1' }),
      ],
      20,
    );
    expect(bars).toHaveLength(1);
    const byId = Object.fromEntries(bars[0].notes.map((n) => [n.noteId, n.reference]));
    expect(byId.a).toBe('Exodus 17:1-3');
    expect(byId.b).toBe('Exodus 17:1');
  });

  it('still lanes notes whose spans differ, even by one verse', () => {
    const bars = assignAnchorLanes(
      [anchor(1, 3, { noteId: 'a' }), anchor(1, 4, { noteId: 'b' })],
      20,
    );
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.lane)).toEqual([0, 1]);
  });

  it('keeps a range whole rather than fanning it per verse', () => {
    // The bug this design replaces: three dots on verses 1/2/3 instead of one bar over 1-3.
    const bars = assignAnchorLanes([anchor(1, 3)], 20);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ startVerse: 1, endVerse: 3 });
  });

  it('packs disjoint notes into the same lane', () => {
    const bars = assignAnchorLanes([anchor(1, 3), anchor(5, 6), anchor(9)], 20);
    expect(bars.map((b) => b.lane)).toEqual([0, 0, 0]);
  });

  it('splits overlapping notes into parallel lanes', () => {
    const bars = assignAnchorLanes([anchor(1, 5), anchor(3, 8), anchor(4, 6)], 20);
    expect(bars.map((b) => b.lane)).toEqual([0, 1, 2]);
  });

  it('reuses a lane as soon as its bar has ended', () => {
    // 1-2 and 4-5 do not touch, so the second reclaims lane 0 while 2-6 holds lane 1.
    const bars = assignAnchorLanes([anchor(1, 2), anchor(2, 6), anchor(4, 5)], 20);
    const byRef = Object.fromEntries(bars.map((b) => [b.reference, b.lane]));
    expect(byRef['Exodus 17:1-2']).toBe(0);
    expect(byRef['Exodus 17:2-6']).toBe(1);
    expect(byRef['Exodus 17:4-5']).toBe(0);
  });

  it('merges a fourth concurrent note into the innermost bar instead of adding a lane', () => {
    const bars = assignAnchorLanes(
      [anchor(1, 10), anchor(2, 10), anchor(3, 10), anchor(4, 10)],
      20,
    );
    expect(bars).toHaveLength(3);
    expect(Math.max(...bars.map((b) => b.lane))).toBe(2);
    const merged = bars.find((b) => b.mergedCount > 1);
    expect(merged?.mergedCount).toBe(2);
    expect(merged?.notes).toHaveLength(2);
  });

  /**
   * The host keeps its own span — this test asserted the opposite until August 2026.
   *
   * Stretching the host to the union made the drawn bar cover verses no note it stands for
   * actually cited, and the note card, which is sized from the bar, then held a passage wider
   * than anything anyone had written about. Length is the property the whole margin design rests
   * on, and that was the one case where it lied. See docs/future/READER_MARGIN_INDICATORS.md.
   */
  it('keeps the host bar at its own span rather than growing it over the merged note', () => {
    // Four DISTINCT overlapping ranges — identical ones would group into a single bar and
    // never reach the lane cap at all.
    const bars = assignAnchorLanes(
      [anchor(1, 6), anchor(2, 7), anchor(3, 8), anchor(4, 12)],
      20,
    );
    const merged = bars.find((b) => b.mergedCount > 1);
    // 8, not 12: the host's own end. Verse 12 is cited only by the note that folded into it.
    expect(merged?.endVerse).toBe(8);
    // ...and no bar anywhere claims a verse its own range does not reach.
    for (const bar of bars) {
      expect(bar.endVerse).toBeGreaterThanOrEqual(bar.startVerse);
      expect(bar.endVerse).toBeLessThanOrEqual(12);
    }
  });

  /** The folded note is still reachable — it rides in the host's card, which lists them all. */
  it('carries the merged note in the host bar it hid behind', () => {
    const bars = assignAnchorLanes(
      [anchor(1, 6), anchor(2, 7), anchor(3, 8), anchor(4, 12)],
      20,
    );
    const merged = bars.find((b) => b.mergedCount > 1);
    expect(merged?.notes).toHaveLength(2);
    expect(merged?.mergedCount).toBe(2);
  });

  it('clamps a cross-chapter range to the last verse shown', () => {
    // "Exodus 6:28-7:7" — verseEnd counts verses in chapter 7, which is not on screen.
    const [bar] = assignAnchorLanes([anchor(28, 7, { chapterEnd: 7 })], 30);
    expect(bar).toMatchObject({ startVerse: 28, endVerse: 30 });
  });

  it('drops an anchor that starts past the rendered chapter', () => {
    expect(assignAnchorLanes([anchor(40, 42)], 20)).toEqual([]);
  });

  it('returns nothing for no anchors', () => {
    expect(assignAnchorLanes(undefined, 20)).toEqual([]);
    expect(assignAnchorLanes([], 20)).toEqual([]);
  });
});
