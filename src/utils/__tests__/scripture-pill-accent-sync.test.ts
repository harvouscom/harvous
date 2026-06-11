import { describe, expect, it } from 'vitest';
import { contentSyncWouldClobberScripturePillAccent } from '../scripture-pill-accent-sync';

describe('contentSyncWouldClobberScripturePillAccent', () => {
  it('returns false when neither side has pill accent', () => {
    expect(
      contentSyncWouldClobberScripturePillAccent(
        '<p><span class="scripture-pill" data-scripture-reference="John 3:16">John 3:16</span></p>',
        '<p><span class="scripture-pill" data-scripture-reference="John 3:16">John 3:16</span></p>',
      ),
    ).toBe(false);
  });

  it('returns true when live editor has accent and incoming prop does not', () => {
    expect(
      contentSyncWouldClobberScripturePillAccent(
        '<p><span class="scripture-pill" data-scripture-reference="John 3:16" data-pill-accent="warmAmber">John 3:16</span></p>',
        '<p><span class="scripture-pill" data-scripture-reference="John 3:16">John 3:16</span></p>',
      ),
    ).toBe(true);
  });

  it('returns false when both sides carry the same accent', () => {
    const html =
      '<p><span class="scripture-pill" data-scripture-reference="John 3:16" data-pill-accent="warmAmber">John 3:16</span></p>';
    expect(contentSyncWouldClobberScripturePillAccent(html, html)).toBe(false);
  });

  it('detects a clobbered accent on the first of two same-reference pills (position-aware)', () => {
    // First pill is warmAmber in the editor but coolBlue in the incoming prop. A reference-keyed
    // compare would collapse both `John 3:16` pills and miss this because the last accent matches.
    const editorHtml =
      '<p>' +
      '<span class="scripture-pill" data-scripture-reference="John 3:16" data-pill-accent="warmAmber">John 3:16</span> ' +
      '<span class="scripture-pill" data-scripture-reference="John 3:16" data-pill-accent="coolBlue">John 3:16</span>' +
      '</p>';
    const propHtml =
      '<p>' +
      '<span class="scripture-pill" data-scripture-reference="John 3:16" data-pill-accent="coolBlue">John 3:16</span> ' +
      '<span class="scripture-pill" data-scripture-reference="John 3:16" data-pill-accent="coolBlue">John 3:16</span>' +
      '</p>';
    expect(contentSyncWouldClobberScripturePillAccent(editorHtml, propHtml)).toBe(true);
  });

  it('returns false when same-reference pills keep their accents in order', () => {
    const html =
      '<p>' +
      '<span class="scripture-pill" data-scripture-reference="John 3:16" data-pill-accent="warmAmber">John 3:16</span> ' +
      '<span class="scripture-pill" data-scripture-reference="John 3:16" data-pill-accent="coolBlue">John 3:16</span>' +
      '</p>';
    expect(contentSyncWouldClobberScripturePillAccent(html, html)).toBe(false);
  });
});
