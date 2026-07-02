import { describe, expect, it } from 'vitest';
import { highlightScriptureReferences } from '../scripture-highlighter';

describe('highlightScriptureReferences pill accent', () => {
  it('emits data-pill-accent without inline background-color', () => {
    const html = '<p>See John 3:16 here</p>';
    const out = highlightScriptureReferences(html, [
      { reference: 'John 3:16', noteId: 'note_scripture_1', translation: 'ESV', accent: 'warmAmber' },
    ]);
    expect(out).toContain('data-pill-accent="warmAmber"');
    expect(out).toContain('class="scripture-pill scripture-pill-clickable"');
    expect(out).not.toContain('background-color');
    expect(out).not.toMatch(/style\s*=/);
  });

  it('does not wrap reference text sitting inside a scripture-quote blockquote attribute value', () => {
    // Reproduces the pull-quote + attribution-pill scenario: the same reference appears both as
    // a real pill (should be wrapped/kept) and inside the blockquote's data-scripture-quote-reference
    // attribute (must NOT be touched — wrapping it there corrupts the tag).
    const html =
      '<blockquote data-scripture-quote-accent="neutral" data-scripture-quote-reference="Proverbs 23:1-35" data-scripture-quote-translation="BSB"><p>Do not let your heart envy sinners</p></blockquote>' +
      '<p>Proverbs 23:1-35</p>';
    const out = highlightScriptureReferences(html, [
      { reference: 'Proverbs 23:1-35', noteId: 'note_scripture_1', translation: 'BSB' },
    ]);
    expect(out).toContain('data-scripture-quote-reference="Proverbs 23:1-35"');
    expect(out).not.toMatch(/data-scripture-quote-reference="\s*<span/);
    expect(out).toMatch(/<p><span[^>]*data-scripture-reference="Proverbs 23:1-35"[^>]*>Proverbs 23:1-35<\/span><\/p>/);
  });
});
