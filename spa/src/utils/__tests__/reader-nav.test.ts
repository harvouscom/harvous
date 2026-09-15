import { describe, it, expect, afterEach } from 'vitest';
import { landAgain, readerRouteForReference, sanitizeReadSearch } from '../reader-nav';

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

describe('sanitizeReadSearch', () => {
  it('turns a verse in ?ref= into a verse focus and drops the dictionary query', () => {
    const next = sanitizeReadSearch({ ref: 'Ecclesiastes 4:3', t: 'NET' });
    expect(next.ref).toBeUndefined();
    expect(next.v).toBe('3');
    expect(next.t).toBe('NET');
  });

  it('leaves a real dictionary headword alone', () => {
    const next = sanitizeReadSearch({ ref: 'faith', v: '16' });
    expect(next.ref).toBe('faith');
    expect(next.v).toBe('16');
  });
});

describe('landAgain', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('changes the URL between taps, so asking twice lands twice', () => {
    const route = readerRouteForReference('John 3:16', 'NET')!;
    const first = landAgain(route);
    const second = landAgain(route);
    expect(first.search.req).not.toBe(second.search.req);
  });

  it('keeps the passage it was given', () => {
    const route = readerRouteForReference('John 3:16-18', 'NET')!;
    const stamped = landAgain(route);
    expect((stamped as { params?: unknown }).params).toEqual(route.params);
    expect(stamped.search.v).toBe('16');
    expect(stamped.search.vEnd).toBe('18');
    expect(stamped.search.t).toBe('NET');
  });

  it('leaves the route it was handed alone', () => {
    const route = readerRouteForReference('John 3:16', 'NET')!;
    landAgain(route);
    expect('req' in route.search).toBe(false);
  });

  it('stays on a reader-stacked note instead of bouncing to the chapter', () => {
    window.history.replaceState({}, '', '/fZLESFI?scriptureRef=Exodus+5%3A1&scriptureTranslation=NLT');
    const stack = document.createElement('div');
    stack.className = 'pds-paper-stack';
    stack.setAttribute('data-origin-kind', 'reader');
    document.body.appendChild(stack);

    const route = readerRouteForReference('Exodus 5:1', 'NLT')!;
    const next = landAgain(route);

    expect(next).toMatchObject({
      params: { noteId: 'fZLESFI' },
      replace: true,
    });
    expect((next as { search: { scriptureRef?: string } }).search.scriptureRef).toBeUndefined();
  });

  it('still lands on the reader from Home when no reader stack is up', () => {
    window.history.replaceState({}, '', '/fZLESFI?scriptureRef=Exodus+5%3A1');
    const route = readerRouteForReference('Exodus 5:1', 'NLT')!;
    const next = landAgain(route);
    expect((next as { params?: { book?: string } }).params).toEqual({ book: 'exodus', chapter: '5' });
  });
});
