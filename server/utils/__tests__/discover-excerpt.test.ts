/**
 * The excerpt stored on every listing and exported to harvous.com.
 *
 * `stripHtmlForPreview` runs adjacent blocks together — the first real listing
 * this feature ever made came out as "FirstoneSecondtwo" from
 * `<h2>First</h2><p>one</p><h2>Second</h2><p>two</p>`. See
 * docs/STRIP_HTML_SPACING_ISSUE.md; the shared util is used in a dozen places
 * and is not this feature's to change, so the spacing goes in before it strips.
 */
import { describe, expect, it } from 'vitest';
import { excerptOf } from '../discover-snapshot';

describe('discover excerpt', () => {
  it('separates adjacent blocks instead of running the words together', () => {
    const html = '<h2>First</h2><p>one</p><h2>Second</h2><p>two</p>';
    expect(excerptOf(html)).toBe('First one Second two');
  });

  it('separates list items and quotes too', () => {
    expect(excerptOf('<ul><li>alpha</li><li>beta</li></ul>')).toBe('alpha beta');
    expect(excerptOf('<blockquote>said</blockquote><p>then</p>')).toBe('said then');
  });

  it('collapses the whitespace it introduces', () => {
    expect(excerptOf('<p>one</p>\n\n<p>two</p>')).toBe('one two');
  });

  it('leaves inline markup alone', () => {
    expect(excerptOf('<p>a <strong>bold</strong> word</p>')).toBe('a bold word');
  });

  it('is empty for empty content rather than throwing', () => {
    expect(excerptOf('')).toBe('');
  });
});
