import { describe, expect, it } from 'vitest';
import { repairScripturePillTranslationsInHtml } from '../scripture-pill-display';

describe('repairScripturePillTranslationsInHtml', () => {
  it('absorbs orphan NLT after NET pill and sets translation on the span', () => {
    const html =
      '<p>Write about <span data-scripture-reference="Exodus 5:1-5" data-note-id="note_1" data-scripture-translation="NET" class="scripture-pill">Exodus 5:1-5</span> NLT and see</p>';
    const repaired = repairScripturePillTranslationsInHtml(html, 'NLT');
    expect(repaired).toContain('data-scripture-translation="NLT"');
    expect(repaired).not.toMatch(/<\/span>\s*NLT/);
    expect(repaired).toContain('and see');
  });

  it('applies default translation to NET pills without trailing abbrev', () => {
    const html =
      '<p><span data-scripture-reference="John 3:16" data-note-id="note_2" data-scripture-translation="NET" class="scripture-pill">John 3:16</span></p>';
    const repaired = repairScripturePillTranslationsInHtml(html, 'ESV');
    expect(repaired).toContain('data-scripture-translation="ESV"');
  });

  it('drops redundant trailing abbrev when pill already has that translation', () => {
    const html =
      '<p><span data-scripture-reference="John 3:16" data-note-id="note_3" data-scripture-translation="NLT" class="scripture-pill">John 3:16</span> NLT rest</p>';
    const repaired = repairScripturePillTranslationsInHtml(html, 'NLT');
    expect(repaired).toContain('data-scripture-translation="NLT"');
    expect(repaired).not.toMatch(/<\/span>\s*NLT/);
    expect(repaired).toContain('rest');
  });

  it('returns html unchanged when no scripture pills', () => {
    const html = '<p>Hello world</p>';
    expect(repairScripturePillTranslationsInHtml(html, 'NLT')).toBe(html);
  });
});
