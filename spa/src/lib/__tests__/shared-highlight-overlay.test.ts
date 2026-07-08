import { describe, expect, it } from 'vitest';
import {
  filterForeignNoteOverlayStudyThreads,
  filterOverlayStudyThreads,
  plainTextOffsetToPmRange,
  pmRangesOverlap,
  resolveStudyThreadPmRange,
} from '../shared-highlight-overlay';

describe('shared-highlight-overlay', () => {
  it('filters entries with anchors', () => {
    const rows = filterOverlayStudyThreads([
      { id: 'a', anchorLocation: 1, anchorLength: 3 } as never,
      { id: 'b', anchorLocation: null, anchorLength: 0 } as never,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('a');
  });

  it('excludes note author rows on foreign notes', () => {
    const rows = filterForeignNoteOverlayStudyThreads(
      [
        { id: 'author', userId: 'u1', anchorLocation: 1, anchorLength: 3 } as never,
        { id: 'member', userId: 'u2', anchorLocation: 4, anchorLength: 2 } as never,
      ],
      'u1',
    );
    expect(rows.map((r) => r.id)).toEqual(['member']);
  });

  it('detects overlapping pm ranges', () => {
    expect(pmRangesOverlap({ from: 1, to: 5 }, { from: 4, to: 8 })).toBe(true);
    expect(pmRangesOverlap({ from: 1, to: 3 }, { from: 4, to: 8 })).toBe(false);
  });

  it('maps plain text offsets to pm ranges', () => {
    const doc = {
      content: { size: 20 },
      textBetween: (from: number, to: number) => (from === 1 && to === 6 ? 'Hello' : ''),
      descendants: (fn: (node: { isText?: boolean; isBlock?: boolean; text?: string }, pos: number) => boolean | void) => {
        fn({ isText: true, text: 'Hello' }, 1);
        return undefined;
      },
    };
    const range = plainTextOffsetToPmRange(doc, 0, 5);
    expect(range).toEqual({ from: 1, to: 6 });
  });

  it('resolves pm ranges from anchor metadata', () => {
    const doc = {
      content: { size: 20 },
      textBetween: () => '',
      descendants: () => undefined,
    };
    expect(resolveStudyThreadPmRange(doc, { anchorLocation: 3, anchorLength: 5 })).toEqual({
      from: 3,
      to: 8,
    });
  });

  it('prefers plain-text offsets when snapshot matches plain mapping', () => {
    const doc = {
      content: { size: 100 },
      textBetween: (from: number, to: number) => (from === 1 && to === 6 ? 'Hello' : ''),
      descendants: (fn: (node: { isText?: boolean; text?: string }, pos: number) => boolean | void) => {
        fn({ isText: true, text: 'Hello world' }, 1);
        return undefined;
      },
    };
    const range = resolveStudyThreadPmRange(doc, {
      anchorLocation: 0,
      anchorLength: 5,
      anchorTextSnapshot: 'Hello',
    });
    expect(range).toEqual({ from: 1, to: 6 });
  });
});
