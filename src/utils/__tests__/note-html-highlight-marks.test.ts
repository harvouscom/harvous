import { describe, expect, it } from 'vitest';
import { stripStudyHighlightMarkInlineBackground } from '../note-html-highlight-marks';

describe('stripStudyHighlightMarkInlineBackground', () => {
  it('removes inline background paint from study highlight marks', () => {
    const html =
      '<p>10 <mark data-color="warmAmber" style="background-color: #f2cf13; color: inherit">years</mark> ago</p>';
    expect(stripStudyHighlightMarkInlineBackground(html)).toBe(
      '<p>10 <mark data-color="warmAmber" style="color: inherit;">years</mark> ago</p>',
    );
  });

  it('drops empty style attributes after stripping backgrounds', () => {
    const html = '<mark style="background-color: rgba(255, 235, 59, 0.4)">word</mark>';
    expect(stripStudyHighlightMarkInlineBackground(html)).toBe('<mark>word</mark>');
  });

  it('removes inline text-shadow glow from marks', () => {
    const html =
      '<mark data-reference="years" style="text-shadow: 0 0 12px rgba(242, 207, 19, 0.6)">years</mark>';
    expect(stripStudyHighlightMarkInlineBackground(html)).toBe(
      '<mark data-reference="years">years</mark>',
    );
  });

  it('leaves marks without inline background unchanged', () => {
    const html = '<p><mark data-color="skyBlue">grace</mark></p>';
    expect(stripStudyHighlightMarkInlineBackground(html)).toBe(html);
  });
});
