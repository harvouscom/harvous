import { describe, expect, it } from 'vitest';
import { plainExcerpt } from '../plain-excerpt';

describe('plainExcerpt', () => {
  it('strips markup and collapses whitespace', () => {
    expect(plainExcerpt('<p>For <em>God</em>  so\nloved</p>')).toBe('For God so loved');
  });

  it('returns short text untouched', () => {
    expect(plainExcerpt('For God so loved the world', 120)).toBe('For God so loved the world');
  });

  it('breaks at a word boundary rather than mid-word', () => {
    // "…the wor…" reads as a bug; "…the world…" reads as a quote.
    const text = 'For God so loved the world that he gave his one and only Son';
    const excerpt = plainExcerpt(text, 24);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).toBe('For God so loved the…');
  });

  it('falls back to a hard cut when there is no usable space', () => {
    const excerpt = plainExcerpt('abcdefghijklmnopqrstuvwxyz', 10);
    expect(excerpt).toBe('abcdefghij…');
  });

  it('drops trailing punctuation before the ellipsis', () => {
    expect(plainExcerpt('In the beginning, God created the heavens', 18)).toBe('In the beginning…');
  });
});

describe('plainExcerpt on verse HTML', () => {
  const VERSE_HTML =
    '<sup class="verse-num" style="font-size:0.55em">6</sup>Seek the Lord while he makes himself ' +
    'available; call to him while he is nearby! <sup class="verse-num" style="font-size:0.55em">7</sup>' +
    'The wicked need to abandon their lifestyle.';

  it('drops verse numbers, which a lock screen cannot render as superscript', () => {
    // Left in, a two-verse reading reads as "6 Seek the Lord… 7 The wicked…", which looks
    // like broken text rather than Scripture.
    const excerpt = plainExcerpt(VERSE_HTML, 200);
    expect(excerpt).toBe(
      'Seek the Lord while he makes himself available; call to him while he is nearby! ' +
        'The wicked need to abandon their lifestyle.',
    );
    expect(excerpt).not.toMatch(/\b[67]\s/);
  });

  it('starts a truncated quote on the first real word', () => {
    expect(plainExcerpt(VERSE_HTML, 40).startsWith('Seek the Lord')).toBe(true);
  });
});

describe('plainExcerpt sentence preference', () => {
  it('stops at a whole sentence rather than on a dangling word', () => {
    const html =
      '<sup>6</sup>Seek the Lord while he makes himself available; call to him while he is ' +
      'nearby! <sup>7</sup>The wicked need to abandon their lifestyle.';
    // The character budget alone would end on "! The", which reads as a broken string.
    expect(plainExcerpt(html, 84)).toBe(
      'Seek the Lord while he makes himself available; call to him while he is nearby!',
    );
  });

  it('does not stop at a sentence that is only the first few words', () => {
    const text = 'Go. Then he went out from the city and traveled a very long way indeed';
    expect(plainExcerpt(text, 40)).toMatch(/…$/);
  });

  it('does not treat an abbreviation or decimal as a sentence end', () => {
    const text = 'He wrote to Dr. Luke about the 3.5 measures of grain that were left behind today';
    expect(plainExcerpt(text, 40)).toBe('He wrote to Dr. Luke about the 3.5…');
  });
});
