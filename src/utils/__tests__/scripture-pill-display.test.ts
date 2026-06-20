import { describe, expect, it } from 'vitest';
import { repairScripturePillTranslationsInHtml, sanitizeScripturePillHtml } from '../scripture-pill-display';

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

describe('sanitizeScripturePillHtml', () => {
  it('unwraps a pill span whose text is not a scripture reference', () => {
    const html =
      '<p><span data-scripture-reference="Exodus 5:6-9" data-note-id="note_1" class="scripture-pill">1. Obedience flows from a relationship with God</span></p>';
    const out = sanitizeScripturePillHtml(html);
    expect(out).not.toContain('data-scripture-reference');
    expect(out).toContain('1. Obedience flows from a relationship with God');
  });

  it('keeps a valid pill span intact', () => {
    const html =
      '<p><span data-scripture-reference="Exodus 5:6-9" data-note-id="note_1" class="scripture-pill">Exodus 5:6-9</span></p>';
    const out = sanitizeScripturePillHtml(html);
    expect(out).toContain('data-scripture-reference="Exodus 5:6-9"');
  });

  it('strips leaked pill-attribute markup from text', () => {
    const leaked =
      '<p>head and heart) <span data-scripture-reference="Exodus 5:6" data-note-id="note_2" class="scripture-pill">Exodus 5:6</span>-9" data-note-id="note_1781474543911" data-scripture-translation="NLT" class="scripture-pill scripture-pill-clickable" style="border-radius: 12px; padding: 2px 8px;">1. Obedience flows from a relationship with God</p>';
    const out = sanitizeScripturePillHtml(leaked);
    expect(out).not.toContain('data-note-id="note_1781474543911"');
    expect(out).not.toContain('border-radius: 12px');
    expect(out).toContain('1. Obedience flows from a relationship with God');
    // The real reference span is preserved.
    expect(out).toContain('data-scripture-reference="Exodus 5:6"');
  });

  it('returns html unchanged when there are no pills', () => {
    const html = '<p>Just prose, no pills.</p>';
    expect(sanitizeScripturePillHtml(html)).toBe(html);
  });
});
