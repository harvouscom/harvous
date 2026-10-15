import { describe, expect, it } from 'vitest';
import { effectiveResourceType, inferResourceType, isResourceType } from '../resource-type';
import { curatedResourceType, detectResourceType } from '../../../server/utils/resource-type-detect';

const link = (sourceUrl: string) => ({ kind: 'link', sourceUrl });
const file = (fileMime: string | null, fileName: string | null = null) => ({ kind: 'file', fileMime, fileName });

describe('inferResourceType', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'video'],
    ['https://vimeo.com/76979871', 'video'],
    ['https://open.spotify.com/show/5CfCWKI5pZ28U0uOzXkDHe', 'series'],
    ['https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', 'article'],
    ['https://harvous.com/blog/the-five-minute-capture/', 'guide'],
    ['https://www.thegospelcoalition.org/course/', 'series'],
    ['https://www.example.org/courses/romans-in-depth', 'series'],
    ['https://www.ccel.org/ccel/augustine/confessions.html', 'book'],
    ['https://example.org/books/the-pilgrims-progress', 'book'],
    ['https://www.blueletterbible.org/study.cfm', 'tool'],
    ['https://www.openbible.info/topics/', 'tool'],
    ['https://gotquestions.com', 'tool'],
    ['https://www.desiringgod.org/articles/read-the-bible-in-one-year', 'article'],
  ])('%s → %s', (url, type) => {
    expect(inferResourceType(link(url))).toBe(type);
  });

  it('types files by format', () => {
    expect(inferResourceType(file('video/mp4'))).toBe('video');
    expect(inferResourceType(file(null, 'Knowing God.epub'))).toBe('book');
    expect(inferResourceType(file('application/pdf', 'handout.pdf'))).toBe('article');
    expect(inferResourceType(file('image/png'))).toBe('article');
  });

  it('calls an unparseable link an article', () => {
    expect(inferResourceType({ kind: 'link', sourceUrl: null })).toBe('article');
  });
});

describe('effectiveResourceType', () => {
  it('prefers the stored type, and ignores one that is not a type', () => {
    expect(effectiveResourceType({ ...link('https://youtu.be/dQw4w9WgXcQ'), resourceType: 'book' })).toBe('book');
    expect(effectiveResourceType({ ...link('https://youtu.be/dQw4w9WgXcQ'), resourceType: 'podcast' })).toBe('video');
    expect(isResourceType('series')).toBe(true);
    expect(isResourceType('pdf')).toBe(false);
  });
});

describe('detectResourceType (server)', () => {
  it('takes a curated listing’s own type, whatever the URL rules say', () => {
    // STEP Bible's home page: the rules would also say tool, but Discover says so outright.
    expect(curatedResourceType('https://stepbible.org')).toBe('tool');
    expect(curatedResourceType('http://www.thegospelcoalition.org/course')).toBe('series');
    expect(curatedResourceType('https://example.org/not-curated')).toBeNull();
  });

  it('makes a page that describes a video a video', () => {
    const html =
      '<html><head><script type="application/ld+json">' +
      JSON.stringify({ '@type': 'VideoObject', contentUrl: 'https://cdn.example.org/v.mp4' }) +
      '</script></head><body></body></html>';
    expect(
      detectResourceType(link('https://example.org/videos/romans'), { html, url: 'https://example.org/videos/romans' }),
    ).toBe('video');
    expect(detectResourceType(link('https://example.org/videos/romans'))).toBe('article');
  });
});
