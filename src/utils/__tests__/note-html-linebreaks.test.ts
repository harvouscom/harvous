import { describe, expect, it } from 'vitest';
import { canonicalizeNoteHtmlLineBreaks } from '../note-html-linebreaks';

describe('canonicalizeNoteHtmlLineBreaks', () => {
  it('converts empty paragraphs to br placeholders', () => {
    expect(canonicalizeNoteHtmlLineBreaks('<p>one</p><p></p><p>two</p>')).toBe(
      '<p>one</p><p><br></p><p>two</p>',
    );
  });

  it('normalizes nbsp-only paragraphs', () => {
    expect(canonicalizeNoteHtmlLineBreaks('<p>&nbsp;</p>')).toBe('<p><br></p>');
  });

  it('leaves non-empty paragraphs unchanged', () => {
    const html = '<p>line one</p><p>line two</p>';
    expect(canonicalizeNoteHtmlLineBreaks(html)).toBe(html);
  });

  it('round-trips blank line through double canonicalize (save/load simulation)', () => {
    const saved = canonicalizeNoteHtmlLineBreaks('<p>first</p><p></p><p>second</p>');
    expect(saved).toBe('<p>first</p><p><br></p><p>second</p>');
    expect(canonicalizeNoteHtmlLineBreaks(saved)).toBe(saved);
  });

  it('preserves Shift+Enter hard break inside a paragraph', () => {
    const html = '<p>line one<br>line two</p>';
    expect(canonicalizeNoteHtmlLineBreaks(html)).toBe(html);
  });
});
