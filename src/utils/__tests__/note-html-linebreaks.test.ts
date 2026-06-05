import { describe, expect, it } from 'vitest';
import {
  canonicalizeNoteHtmlLineBreaks,
  stripHrAdjacentEmptyParagraphs,
} from '../note-html-linebreaks';

describe('stripHrAdjacentEmptyParagraphs', () => {
  it('removes empty paragraph before hr', () => {
    expect(stripHrAdjacentEmptyParagraphs('<p>Above</p><p></p><hr><p>Below</p>')).toBe(
      '<p>Above</p><hr><p>Below</p>',
    );
  });

  it('removes br-only paragraph after hr', () => {
    expect(stripHrAdjacentEmptyParagraphs('<p>Above</p><hr><p><br></p><p>Below</p>')).toBe(
      '<p>Above</p><hr><p>Below</p>',
    );
  });

  it('leaves intentional blank lines away from hr', () => {
    const html = '<p>one</p><p></p><p>two</p>';
    expect(stripHrAdjacentEmptyParagraphs(html)).toBe(html);
  });
});

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
