import { describe, expect, it } from 'vitest';
import { resolveResourceViewer, resourceEmbedFor } from '../resource-viewer-kind';

const link = (sourceUrl: string | null) => ({ kind: 'link', sourceUrl, fileMime: null, fileName: null });
const file = (fileMime: string | null, fileName: string | null = null) => ({
  kind: 'file',
  sourceUrl: null,
  fileMime,
  fileName,
});

describe('resourceEmbedFor', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'],
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=90'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=42'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'],
  ])('plays %s in the no-cookie player', (url, src) => {
    expect(resourceEmbedFor(url)).toEqual({ provider: 'youtube', src, shape: 'video', id: 'dQw4w9WgXcQ' });
  });

  it('refuses a YouTube page that is not one video', () => {
    expect(resourceEmbedFor('https://www.youtube.com/@BibleProject')).toBeNull();
    expect(resourceEmbedFor('https://www.youtube.com/watch?v=short')).toBeNull();
  });

  it('plays Vimeo, keeping an unlisted video’s hash', () => {
    expect(resourceEmbedFor('https://vimeo.com/76979871')?.src).toBe(
      'https://player.vimeo.com/video/76979871?dnt=1',
    );
    expect(resourceEmbedFor('https://vimeo.com/76979871/abc123ef')?.src).toBe(
      'https://player.vimeo.com/video/76979871?h=abc123ef&dnt=1',
    );
    expect(resourceEmbedFor('https://vimeo.com/channels/staffpicks/76979871')?.provider).toBe('vimeo');
  });

  it('plays Spotify episodes and shows as an audio strip', () => {
    expect(resourceEmbedFor('https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=x')).toEqual({
      provider: 'spotify',
      src: 'https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk',
      shape: 'audio',
    });
    expect(resourceEmbedFor('https://open.spotify.com/intl-de/show/5CfCWKI5pZ28U0uOzXkDHe')?.src).toBe(
      'https://open.spotify.com/embed/show/5CfCWKI5pZ28U0uOzXkDHe',
    );
  });

  it('ignores lookalike hosts and other schemes', () => {
    expect(resourceEmbedFor('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(resourceEmbedFor('javascript:alert(1)')).toBeNull();
    expect(resourceEmbedFor('not a url')).toBeNull();
  });
});

describe('resolveResourceViewer', () => {
  it('reads an ordinary link in reader view', () => {
    expect(resolveResourceViewer(link('https://bibleproject.com/articles/what-is-the-gospel/'))).toEqual({
      kind: 'reader',
    });
  });

  it('embeds a video link instead of reading it', () => {
    expect(resolveResourceViewer(link('https://youtu.be/dQw4w9WgXcQ')).kind).toBe('embed');
  });

  it('gives a remote PDF link and a link with no URL the card', () => {
    expect(resolveResourceViewer(link('https://example.org/handout.pdf')).kind).toBe('card');
    expect(resolveResourceViewer(link('https://example.org/handout.PDF?dl=1')).kind).toBe('card');
    expect(resolveResourceViewer(link(null)).kind).toBe('card');
  });

  it.each([
    ['application/pdf', null, 'pdf'],
    [null, 'Handout.pdf', 'pdf'],
    ['image/png', null, 'image'],
    ['image/jpeg', null, 'image'],
    ['video/mp4', null, 'video'],
    ['audio/mpeg', null, 'audio'],
    ['text/plain', null, 'text'],
    ['text/markdown', null, 'text'],
    [null, 'outline.md', 'text'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'notes.docx', 'card'],
    ['application/octet-stream', 'mystery.bin', 'card'],
  ])('shows a %s file (%s) as %s', (mime, name, kind) => {
    expect(resolveResourceViewer(file(mime, name)).kind).toBe(kind);
  });

  it('gives an unknown item kind the card', () => {
    expect(resolveResourceViewer({ kind: 'note_ref', sourceUrl: null, fileMime: null, fileName: null }).kind).toBe(
      'card',
    );
  });
});
