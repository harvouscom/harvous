import { describe, expect, it } from 'vitest';
import { filterOverlayStudyThreads, plainTextOffsetToPmRange } from '../shared-highlight-overlay';

describe('shared-highlight-overlay', () => {
  it('filters entries with anchors', () => {
    const rows = filterOverlayStudyThreads([
      { id: 'a', anchorLocation: 1, anchorLength: 3 } as never,
      { id: 'b', anchorLocation: null, anchorLength: 0 } as never,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('a');
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
});
