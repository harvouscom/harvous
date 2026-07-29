import { describe, expect, it } from 'vitest';
import {
  repairScripturePillTranslationsInHtml,
  sanitizeScripturePillHtml,
  repairCorruptedScriptureQuoteAttributes,
} from '../scripture-pill-display';

describe('repairCorruptedScriptureQuoteAttributes', () => {
  it('unwraps a pill span injected inside data-scripture-quote-reference and restores the clean attribute', () => {
    const corrupted =
      '<blockquote data-scripture-quote-accent="neutral" data-scripture-quote-reference="<span data-scripture-reference="Proverbs 23:1-35" data-note-id="note_1" data-scripture-translation="BSB" data-scripture-translation-label="BSB" class="scripture-pill scripture-pill-clickable">Proverbs 23:1-35</span>" data-scripture-quote-translation="BSB"><p>Do not let your heart envy sinners</p></blockquote>';
    const repaired = repairCorruptedScriptureQuoteAttributes(corrupted);
    expect(repaired).toBe(
      '<blockquote data-scripture-quote-accent="neutral" data-scripture-quote-reference="Proverbs 23:1-35" data-scripture-quote-translation="BSB"><p>Do not let your heart envy sinners</p></blockquote>',
    );
  });

  it('repairs multiple corrupted quote blocks in the same note', () => {
    const one =
      'data-scripture-quote-reference="<span data-scripture-reference="Proverbs 23:1-35" data-note-id="note_1" class="scripture-pill">Proverbs 23:1-35</span>"';
    const corrupted = `<blockquote ${one}></blockquote><p>gap</p><blockquote ${one}></blockquote>`;
    const repaired = repairCorruptedScriptureQuoteAttributes(corrupted);
    expect(repaired).toBe(
      '<blockquote data-scripture-quote-reference="Proverbs 23:1-35"></blockquote><p>gap</p><blockquote data-scripture-quote-reference="Proverbs 23:1-35"></blockquote>',
    );
  });

  it('returns clean html unchanged', () => {
    const html = '<blockquote data-scripture-quote-reference="Proverbs 23:1-35"><p>text</p></blockquote>';
    expect(repairCorruptedScriptureQuoteAttributes(html)).toBe(html);
  });

  it('repairs the real-world shape where the injected pill only wraps a prefix of the reference (production repro)', () => {
    // The attribution pill references "Proverbs 23" (book+chapter) while the quote's full
    // reference is "Proverbs 23:1-35" — so the injected <span> wraps only the prefix, leaving
    // ":1-35" as literal trailing text before the attribute's real closing quote.
    const corrupted =
      '<p><span data-scripture-reference="Proverbs 23" data-note-id="note_1" data-scripture-translation="BSB" data-scripture-translation-label="BSB" class="scripture-pill scripture-pill-clickable">Proverbs 23</span> </p>' +
      '<blockquote data-scripture-quote-accent="neutral" data-scripture-quote-reference="<span data-scripture-reference="Proverbs 23" data-note-id="note_1" data-scripture-translation="BSB" data-scripture-translation-label="BSB" class="scripture-pill scripture-pill-clickable">Proverbs 23</span>:1-35" data-scripture-quote-translation="BSB"><p>Do not let your heart envy sinners, but always continue in the fear of the LORD.</p></blockquote>';
    const repaired = repairCorruptedScriptureQuoteAttributes(corrupted);
    expect(repaired).toContain('data-scripture-quote-reference="Proverbs 23:1-35"');
    expect(repaired).not.toMatch(/data-scripture-quote-reference="[^"]*<span/);
    // The real pill (outside the blockquote attribute) must be left untouched.
    expect(repaired).toContain(
      '<span data-scripture-reference="Proverbs 23" data-note-id="note_1" data-scripture-translation="BSB" data-scripture-translation-label="BSB" class="scripture-pill scripture-pill-clickable">Proverbs 23</span>',
    );
  });
});

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

  it('strips event-handler XSS before DOM parse when pills are present', () => {
    const html =
      '<p><img src=x onerror="window.__xss=1"><span data-scripture-reference="John 3:16" data-note-id="note_1" class="scripture-pill">John 3:16</span></p>';
    const out = sanitizeScripturePillHtml(html);
    expect(out).not.toMatch(/onerror/i);
    expect(out).toContain('data-scripture-reference="John 3:16"');
  });
});
