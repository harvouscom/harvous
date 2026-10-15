import { describe, expect, it } from 'vitest';
import { extractResourceVideo, hostedVideoFrom, isoDurationSeconds } from '../resource-video';

const page = (head: string) => `<!doctype html><html><head>${head}</head><body><p>Hello</p></body></html>`;
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

/* The shape BibleProject actually ships (trimmed): a VideoObject inside an @graph, with a
   progressive mp4 on Mux, an ISO duration and a thumbnail. */
const BIBLEPROJECT = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', name: 'BibleProject' },
    { '@type': 'WebPage', name: 'The Story of the Bible' },
    {
      '@type': 'VideoObject',
      contentUrl: 'https://stream.mux.com/SPNOVb3wBYm9x027k91yQrXN4RzVoufBU6fVB47Q9nI4/high.mp4',
      duration: 'PT5M17S',
      thumbnailUrl: 'https://ik.imagekit.io/bpweb1/story-of-the-bible_16.9.jpg',
      name: 'The Story of the Bible',
    },
  ],
};

describe('extractResourceVideo', () => {
  it('finds a progressive file in an @graph VideoObject', () => {
    expect(extractResourceVideo(page(ld(BIBLEPROJECT)), 'https://bibleproject.com/videos/x/')).toEqual({
      kind: 'file',
      src: 'https://stream.mux.com/SPNOVb3wBYm9x027k91yQrXN4RzVoufBU6fVB47Q9nI4/high.mp4',
      poster: 'https://ik.imagekit.io/bpweb1/story-of-the-bible_16.9.jpg',
      durationSeconds: 317,
    });
  });

  it('prefers a hosted player named by embedUrl', () => {
    const html = page(
      ld({
        '@type': 'VideoObject',
        embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        contentUrl: 'https://example.org/v.mp4',
        thumbnailUrl: ['https://example.org/t.jpg'],
        duration: 'PT1H2M3S',
      }),
    );
    expect(extractResourceVideo(html, 'https://example.org/')).toEqual({
      kind: 'youtube',
      id: 'dQw4w9WgXcQ',
      poster: 'https://example.org/t.jpg',
      durationSeconds: 3723,
    });
  });

  it('falls back to og:video, with og:image as the poster', () => {
    const html = page(
      '<meta property="og:image" content="https://example.org/p.jpg">' +
        '<meta property="og:video:secure_url" content="https://player.vimeo.com/video/76979871?h=abc123">',
    );
    expect(extractResourceVideo(html, 'https://example.org/')).toEqual({
      kind: 'vimeo',
      id: '76979871',
      hash: 'abc123',
      poster: 'https://example.org/p.jpg',
      durationSeconds: null,
    });
  });

  it('skips what a browser cannot play in place', () => {
    const hls = page(ld({ '@type': 'VideoObject', contentUrl: 'https://stream.mux.com/abc.m3u8' }));
    expect(extractResourceVideo(hls, 'https://example.org/')).toBeNull();
    const insecure = page(ld({ '@type': 'VideoObject', contentUrl: 'http://example.org/v.mp4' }));
    expect(extractResourceVideo(insecure, 'https://example.org/')).toBeNull();
  });

  it('answers null for an ordinary article and survives broken JSON-LD', () => {
    expect(extractResourceVideo(page(ld({ '@type': 'Article', headline: 'x' })), 'https://example.org/')).toBeNull();
    expect(extractResourceVideo(page('<script type="application/ld+json">{not json</script>'), 'https://example.org/')).toBeNull();
  });
});

describe('isoDurationSeconds', () => {
  it.each([
    ['PT5M17S', 317],
    ['PT45S', 45],
    ['PT1H', 3600],
    ['PT0S', null],
    ['5:17', null],
    [undefined, null],
  ])('%s → %s', (raw, seconds) => {
    expect(isoDurationSeconds(raw)).toBe(seconds);
  });
});

describe('hostedVideoFrom', () => {
  it('ignores lookalike hosts', () => {
    expect(hostedVideoFrom('https://youtube.com.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(hostedVideoFrom('https://youtu.be/dQw4w9WgXcQ')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ' });
  });
});
