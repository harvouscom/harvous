import { describe, expect, it } from 'vitest';
import { parseExternalMarkdownToPortable, parseHtmlToPortable, wordHighlightToAccent } from '@/utils/portable-ingest';

describe('portable-ingest', () => {
  it('maps Word highlight colors to accent tokens', () => {
    expect(wordHighlightToAccent('yellow')).toBe('warmAmber');
    expect(wordHighlightToAccent('green')).toBe('mintGreen');
    expect(wordHighlightToAccent('cyan')).toBe('skyBlue');
  });

  it('parses external markdown ==highlights==', () => {
    const doc = parseExternalMarkdownToPortable('# Title\n\nHello ==world== today', 'Fallback');
    expect(doc.meta.title).toBe('Title');
    expect(doc.highlights.some((h) => h.anchorText === 'world')).toBe(true);
  });

  it('parses HTML mark tags into highlights', () => {
    const doc = parseHtmlToPortable(
      '<p>Text with <mark data-color="warmAmber">grace</mark> here.</p>',
      'HTML note',
    );
    expect(doc.highlights.some((h) => h.anchorText === 'grace')).toBe(true);
    expect(doc.body).toContain('==grace==');
  });
});
