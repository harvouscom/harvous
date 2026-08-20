import { describe, it, expect } from 'vitest';
import { readerRouteForReference } from '../reader-nav';

describe('readerRouteForReference', () => {
  it('carries both ends of a range', () => {
    const route = readerRouteForReference('John 3:16-18', 'NET');
    expect(route?.params).toEqual({ book: 'john', chapter: '3' });
    expect(route?.search.v).toBe('16');
    expect(route?.search.vEnd).toBe('18');
  });

  it('omits vEnd for a single verse, so one verse never looks like a range', () => {
    const route = readerRouteForReference('John 3:16', 'NET');
    expect(route?.search.v).toBe('16');
    expect(route?.search.vEnd).toBeUndefined();
  });

  it('focuses nothing for a chapter-only reference', () => {
    const route = readerRouteForReference('John 3', 'NET');
    expect(route?.params).toEqual({ book: 'john', chapter: '3' });
    expect(route?.search.v).toBeUndefined();
    expect(route?.search.vEnd).toBeUndefined();
  });

  it('returns null rather than a malformed route', () => {
    expect(readerRouteForReference('not a reference', 'NET')).toBeNull();
  });
});
