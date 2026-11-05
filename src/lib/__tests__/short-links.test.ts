import { describe, expect, it } from 'vitest';
import { isShortLinkPrefix, longPathForShortLink, shareUrlFor } from '../short-links';
import { normalizeReferenceSegment, scriptureReadPathFor } from '../short-link-scripture';
import { resolveShortLink } from '../short-link-resolve';

const NOTE_TOKEN = 'aB3dE5gH7jK9'; // base62, generateShareToken()
const CHURCH_TOKEN = 'ABCdefJKLmn2'; // the church alphabet's look-alike-free subset

const resolve = (path: string) => resolveShortLink(new URL(`https://harvo.us${path}`));

describe('shareUrlFor', () => {
  it('shortens on production', () => {
    expect(shareUrlFor('note', NOTE_TOKEN, 'https://app.harvous.com')).toBe(`https://harvo.us/n/${NOTE_TOKEN}`);
    expect(shareUrlFor('thread', NOTE_TOKEN, 'https://app.harvous.com/')).toBe(`https://harvo.us/t/${NOTE_TOKEN}`);
    expect(shareUrlFor('church', CHURCH_TOKEN, 'https://app.harvous.com')).toBe(`https://harvo.us/j/${CHURCH_TOKEN}`);
  });

  it('keeps every other origin on its own long link', () => {
    expect(shareUrlFor('note', NOTE_TOKEN, 'https://new.harvous.com')).toBe(
      `https://new.harvous.com/shared/note/${NOTE_TOKEN}`,
    );
    expect(shareUrlFor('thread', NOTE_TOKEN, 'http://localhost:4321/')).toBe(
      `http://localhost:4321/shared/thread/${NOTE_TOKEN}`,
    );
    expect(shareUrlFor('church', CHURCH_TOKEN, 'http://harvous.fly.dev')).toBe(
      `http://harvous.fly.dev/churches/join/${CHURCH_TOKEN}`,
    );
  });

  it('never shortens a token harvo.us could not resolve', () => {
    expect(shareUrlFor('note', 'short', 'https://app.harvous.com')).toBe('https://app.harvous.com/shared/note/short');
  });
});

describe('longPathForShortLink', () => {
  it('maps each wired prefix', () => {
    expect(longPathForShortLink(`/n/${NOTE_TOKEN}`)).toBe(`/shared/note/${NOTE_TOKEN}`);
    expect(longPathForShortLink(`/t/${NOTE_TOKEN}/`)).toBe(`/shared/thread/${NOTE_TOKEN}`);
    expect(longPathForShortLink(`/j/${CHURCH_TOKEN}`)).toBe(`/churches/join/${CHURCH_TOKEN}`);
  });

  it('rejects malformed tokens, reserved prefixes and extra segments', () => {
    expect(longPathForShortLink('/n/abc')).toBeNull();
    expect(longPathForShortLink(`/n/${NOTE_TOKEN}x`)).toBeNull();
    expect(longPathForShortLink('/n/aB3dE5gH7j%2F')).toBeNull();
    expect(longPathForShortLink(`/s/${NOTE_TOKEN}`)).toBeNull();
    expect(longPathForShortLink(`/n/${NOTE_TOKEN}/more`)).toBeNull();
    expect(longPathForShortLink(`/N/${NOTE_TOKEN}`)).toBeNull();
  });

  it('knows its prefixes', () => {
    for (const p of ['n', 't', 'j', 's', 'f']) expect(isShortLinkPrefix(p)).toBe(true);
    expect(isShortLinkPrefix('john3')).toBe(false);
  });
});

describe('normalizeReferenceSegment', () => {
  it.each([
    ['john3.16', 'john 3:16'],
    ['1cor13', '1 cor 13'],
    ['song-of-solomon2', 'song of solomon 2'],
    ['1-corinthians-13', '1 corinthians 13'],
    ['rom8.28-39', 'rom 8:28-39'],
    ['1cor13.4-7', '1 cor 13:4-7'],
    ['John%203%3A16', 'john 3:16'],
  ])('%s → %s', (raw, written) => {
    expect(normalizeReferenceSegment(raw)).toBe(written);
  });

  it('refuses bad encoding and absurd lengths', () => {
    expect(normalizeReferenceSegment('%E0%A4%A')).toBeNull();
    expect(normalizeReferenceSegment('a'.repeat(41))).toBeNull();
  });
});

describe('scriptureReadPathFor', () => {
  it.each([
    ['john3.16', '/read/john/3?v=16'],
    ['jn3.16', '/read/john/3?v=16'],
    ['John3:16', '/read/john/3?v=16'],
    ['john3', '/read/john/3'],
    ['rom8.28-39', '/read/romans/8?v=28&vEnd=39'],
    ['1cor13', '/read/1-corinthians/13'],
    ['1cor13.4-7', '/read/1-corinthians/13?v=4&vEnd=7'],
    ['ps23', '/read/psalms/23'],
    ['gen1.1', '/read/genesis/1?v=1'],
    ['song-of-solomon2', '/read/song-of-solomon/2'],
    ['phil4.13', '/read/philippians/4?v=13'],
    ['2tim1', '/read/2-timothy/1'],
    ['rev22.21', '/read/revelation/22?v=21'],
    ['jude1.3', '/read/jude/1?v=3'],
  ])('%s → %s', (segment, path) => {
    expect(scriptureReadPathFor(segment)).toBe(path);
  });

  it.each(['mark', 'hmc', 'john99', 'abc', 'favicon.ico', 'robots.txt', ''])('%s is not a passage', (segment) => {
    expect(scriptureReadPathFor(segment)).toBeNull();
  });
});

describe('resolveShortLink', () => {
  it('sends the root and anything unplaceable to harvous.com', () => {
    expect(resolve('/')).toBe('https://harvous.com');
    expect(resolve('/hmc')).toBe('https://harvous.com');
    expect(resolve('/favicon.ico')).toBe('https://harvous.com');
    expect(resolve('/robots.txt')).toBe('https://harvous.com');
    expect(resolve('/john3.16/extra')).toBe('https://harvous.com');
    expect(resolve(`/s/${NOTE_TOKEN}`)).toBe('https://harvous.com');
    expect(resolve('/n')).toBe('https://harvous.com');
  });

  it('sends share links to the app, query intact', () => {
    expect(resolve(`/n/${NOTE_TOKEN}`)).toBe(`https://app.harvous.com/shared/note/${NOTE_TOKEN}`);
    expect(resolve(`/t/${NOTE_TOKEN}?utm_source=bulletin`)).toBe(
      `https://app.harvous.com/shared/thread/${NOTE_TOKEN}?utm_source=bulletin`,
    );
    expect(resolve(`/j/${CHURCH_TOKEN}`)).toBe(`https://app.harvous.com/churches/join/${CHURCH_TOKEN}`);
  });

  it('sends Scripture to the reader, letting a translation ride along', () => {
    expect(resolve('/john3.16')).toBe('https://app.harvous.com/read/john/3?v=16');
    expect(resolve('/john3.16?t=ESV')).toBe('https://app.harvous.com/read/john/3?v=16&t=ESV');
    expect(resolve('/john3.16?v=99')).toBe('https://app.harvous.com/read/john/3?v=16');
  });

  it('honours configured origins', () => {
    expect(
      resolveShortLink(new URL(`https://harvo.us/n/${NOTE_TOKEN}`), {
        appOrigin: 'https://new.harvous.com/',
        siteOrigin: 'https://example.com',
      }),
    ).toBe(`https://new.harvous.com/shared/note/${NOTE_TOKEN}`);
  });
});
