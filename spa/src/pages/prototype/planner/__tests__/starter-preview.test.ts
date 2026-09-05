/**
 * The drawing of a template's shape.
 *
 * Pure, so the thing the tile is actually claiming can be asserted without
 * rendering one: that two templates which differ look different, and that the
 * blank choice looks blank.
 */
import { describe, expect, it } from 'vitest';
import { starterPreviewLines } from '../starter-preview';

describe('starterPreviewLines', () => {
  it('draws nothing for an empty template', () => {
    expect(starterPreviewLines('')).toEqual([]);
    expect(starterPreviewLines(null)).toEqual([]);
    expect(starterPreviewLines(undefined)).toEqual([]);
  });

  it('skips the empty paragraphs a template uses as spacing', () => {
    // Real content from an org template: prompts separated by blank lines.
    const lines = starterPreviewLines('<p>Point 1</p><p><br></p><p>Point 2</p><p><br></p>');
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => !l.heading)).toBe(true);
  });

  it('marks headings so a structured template reads as structured', () => {
    const lines = starterPreviewLines('<h2>Big idea</h2><p>What stood out</p>');
    expect(lines.map((l) => l.heading)).toEqual([true, false]);
  });

  it('makes a short prompt visibly shorter than a long one', () => {
    // This is the whole claim of the drawing — same block count, different shape.
    const short = starterPreviewLines('<p>Why?</p>')[0];
    const long = starterPreviewLines('<p>What did this passage ask of you this week?</p>')[0];
    expect(short.width).toBeLessThan(long.width);
  });

  it('never draws a bar wider than the tile or too thin to see', () => {
    const long = starterPreviewLines(`<p>${'x'.repeat(400)}</p>`)[0];
    const tiny = starterPreviewLines('<p>Hi</p>')[0];
    expect(long.width).toBeLessThanOrEqual(1);
    expect(tiny.width).toBeGreaterThanOrEqual(0.25);
  });

  it('stops before the bars become illegible', () => {
    const many = starterPreviewLines('<p>a line here</p>'.repeat(20));
    expect(many).toHaveLength(5);
  });

  it('does not let a scripture pill read as a full-width line', () => {
    /*
      A pill's markup is far longer than the reference it renders, so measuring
      the raw HTML would draw every template that opens with one as full width.
    */
    const pill =
      '<span data-scripture-reference="John 3:16" data-scripture-translation="NLT" class="scripture-pill">John 3:16</span>';
    const withPill = starterPreviewLines(`<p>${pill}</p>`)[0];
    const bare = starterPreviewLines('<p>John 3:16</p>')[0];
    expect(withPill.width).toBeCloseTo(bare.width, 5);
  });

  it('still draws a shape for a template saved as bare text', () => {
    // No block tags to match; an empty page is the one thing this must not show.
    expect(starterPreviewLines('Just some text')).toHaveLength(1);
  });
});
