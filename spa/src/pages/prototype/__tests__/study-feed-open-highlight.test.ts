import { describe, expect, it } from 'vitest';
import { highlightPassageRoute } from '../study-feed-open-highlight';

describe('highlightPassageRoute', () => {
  it('lands on the verse and does not put it in ?ref=', () => {
    const route = highlightPassageRoute('Ecclesiastes 4:3');
    expect(route?.params).toEqual({ book: 'ecclesiastes', chapter: '4' });
    expect(route?.search.v).toBe('3');
    /*
     * Read through a widened type on purpose. The search type no longer declares `ref` at all,
     * so `route.search.ref` stopped compiling — but deleting the assertion would remove the
     * guard that gives this test its name, and leave nothing to fail if `ref` is ever put back
     * carrying a value.
     */
    expect((route?.search as Record<string, unknown> | undefined)?.ref).toBeUndefined();
    expect(route?.search.req).toEqual(expect.any(String));
  });

  it('returns null when the label is not a passage', () => {
    expect(highlightPassageRoute('not a reference')).toBeNull();
  });
});
