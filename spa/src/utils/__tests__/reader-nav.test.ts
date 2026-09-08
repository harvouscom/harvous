import { describe, it, expect } from 'vitest';
import { landAgain, readerRouteForReference } from '../reader-nav';

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

describe('landAgain', () => {
  it('changes the URL between taps, so asking twice lands twice', () => {
    const route = readerRouteForReference('John 3:16', 'NET')!;
    const first = landAgain(route);
    const second = landAgain(route);
    // The router treats an identical URL as no navigation at all — differing is the whole job.
    expect(first.search.req).not.toBe(second.search.req);
  });

  it('keeps the passage it was given', () => {
    const route = readerRouteForReference('John 3:16-18', 'NET')!;
    const stamped = landAgain(route);
    expect(stamped.params).toEqual(route.params);
    expect(stamped.search.v).toBe('16');
    expect(stamped.search.vEnd).toBe('18');
    expect(stamped.search.t).toBe('NET');
  });

  it('leaves the route it was handed alone', () => {
    // Callers pass a route they may reuse (a fallback object, a memoised value); stamping is
    // not allowed to be the thing that mutates it out from under them.
    const route = readerRouteForReference('John 3:16', 'NET')!;
    landAgain(route);
    expect('req' in route.search).toBe(false);
  });
});
