import { describe, expect, it } from 'vitest';
import { highlightPassageRoute } from '../study-feed-open-highlight';

describe('highlightPassageRoute', () => {
  it('lands on the verse and does not put it in ?ref=', () => {
    const route = highlightPassageRoute('Ecclesiastes 4:3');
    expect(route?.params).toEqual({ book: 'ecclesiastes', chapter: '4' });
    expect(route?.search.v).toBe('3');
    expect(route?.search.ref).toBeUndefined();
    expect(route?.search.req).toEqual(expect.any(String));
  });

  it('returns null when the label is not a passage', () => {
    expect(highlightPassageRoute('not a reference')).toBeNull();
  });
});
