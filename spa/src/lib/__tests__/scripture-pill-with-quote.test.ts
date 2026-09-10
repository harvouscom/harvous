import { describe, it, expect } from 'vitest';
import { buildScripturePillWithQuoteHtml } from '../votd-scripture-pill-html';

describe('buildScripturePillWithQuoteHtml', () => {
  it('emits the three attributes the quote node parses back', () => {
    const html = buildScripturePillWithQuoteHtml('John 3:16', 'NET', {
      reference: 'John 3:16',
      text: 'For this is the way God loved the world',
      accent: 'warmAmber',
    });
    expect(html).toContain('data-scripture-quote-accent="warmAmber"');
    expect(html).toContain('data-scripture-quote-reference="John 3:16"');
    expect(html).toContain('data-scripture-quote-translation="NET"');
    expect(html).toContain('For this is the way God loved the world');
    // A paragraph after the quote, or the caret opens inside Scripture and the reader's first
    // sentence is typed into the verse.
    expect(html.endsWith('<p></p>')).toBe(true);
  });

  it('is the pill alone when there is nothing the reader marked', () => {
    const html = buildScripturePillWithQuoteHtml('John 3', 'NET', null);
    expect(html).toContain('data-scripture-reference="John 3"');
    expect(html).not.toContain('blockquote');
    expect(buildScripturePillWithQuoteHtml('John 3', 'NET', { reference: 'John 3:16', text: '  ' })).not.toContain(
      'blockquote',
    );
  });

  it('escapes what the reader marked, in the text and in the attribute', () => {
    const html = buildScripturePillWithQuoteHtml('John 3:16', 'NET', {
      reference: 'John 3:16',
      text: 'a < b & "quoted"',
    });
    expect(html).toContain('a &lt; b &amp; "quoted"');
    expect(html).not.toMatch(/<p>a < b/);
  });

  it('falls back to a neutral accent rather than inventing one', () => {
    const html = buildScripturePillWithQuoteHtml('John 3:16', 'NET', {
      reference: 'John 3:16',
      text: 'words',
      accent: 'not-an-accent',
    });
    expect(html).toContain('data-scripture-quote-accent="neutral"');
  });
});
