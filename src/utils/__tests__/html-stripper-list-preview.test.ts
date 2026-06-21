import { describe, expect, it } from 'vitest';
import { stripHtmlForListPreview } from '../html-stripper';

describe('stripHtmlForListPreview', () => {
  it('joins block lines with a space separator', () => {
    expect(stripHtmlForListPreview('<p>Proverbs 16:9</p><p>Writing about Exodus 5:1-10</p>', 80)).toBe(
      'Proverbs 16:9 Writing about Exodus 5:1-10',
    );
  });

  it('skips empty filler paragraphs and uses later lines', () => {
    const preview = stripHtmlForListPreview('<p>&nbsp;</p><p>Writing about Exodus</p>', 80);
    expect(preview).toBe('Writing about Exodus');
    expect(preview).not.toContain('&nbsp');
  });

  it('fills preview from additional lines when the first is short', () => {
    expect(stripHtmlForListPreview('<p>Hi</p><p>Second line here</p><p>Third</p>', 80)).toBe(
      'Hi Second line here Third',
    );
  });

  it('truncates with ellipsis when content exceeds max length', () => {
    const long = '<p>' + 'word '.repeat(40) + '</p>';
    const preview = stripHtmlForListPreview(long, 20);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(21);
  });

  it('shows one translation when NET pill has trailing NLT abbrev', () => {
    const html =
      '<p><span data-scripture-reference="Titus 1:1" data-note-id="note_1" data-scripture-translation="NET" class="scripture-pill">Titus 1:1</span> NLT</p>';
    const preview = stripHtmlForListPreview(html, 80);
    expect(preview).toBe('Titus 1:1 NLT');
    expect(preview).not.toContain('NET');
  });

  it('dedupes redundant trailing abbrev when pill already has that translation', () => {
    const html =
      '<p><span data-scripture-reference="John 3:16" data-note-id="note_3" data-scripture-translation="NLT" class="scripture-pill">John 3:16</span> NLT rest</p>';
    const preview = stripHtmlForListPreview(html, 80);
    expect(preview).toBe('John 3:16 NLT rest');
    expect(preview.match(/\bNLT\b/g)?.length).toBe(1);
  });

  it('preserves prose after pill when trailing abbrev is consumed', () => {
    const html =
      '<p>Write about <span data-scripture-reference="Exodus 5:1-5" data-note-id="note_1" data-scripture-translation="NET" class="scripture-pill">Exodus 5:1-5</span> NLT and see</p>';
    const preview = stripHtmlForListPreview(html, 80);
    expect(preview).toBe('Write about Exodus 5:1-5 NLT and see');
  });

  it('joins multi-paragraph notes with scripture pills using spaces', () => {
    const html =
      '<p>Ps Jared</p><p><span data-scripture-reference="Exodus 5:1-5" data-scripture-translation="NLT" class="scripture-pill">Exodus 5:1-5</span> NLT</p><p>Pharaoh is a title</p>';
    const preview = stripHtmlForListPreview(html, 80);
    expect(preview).toBe('Ps Jared Exodus 5:1-5 NLT Pharaoh is a title');
    expect(preview).not.toContain('JaredExodus');
    expect(preview).not.toContain('NLTPharaoh');
  });

  it('adds space between inline text and scripture pill in one paragraph', () => {
    const html =
      '<p>Ps Jared<span data-scripture-reference="Exodus 5:1-5" data-scripture-translation="NLT" class="scripture-pill">Exodus 5:1-5</span> NLTPharaoh is a title</p>';
    const preview = stripHtmlForListPreview(html, 80);
    expect(preview).toContain('Ps Jared Exodus 5:1-5 NLT');
    expect(preview).not.toContain('JaredExodus');
  });

  it('joins br-separated lines with a space', () => {
    expect(stripHtmlForListPreview('<p>Line1<br>Line2</p>', 80)).toBe('Line1 Line2');
  });
});
