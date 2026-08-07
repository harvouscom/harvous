import { describe, expect, it } from 'vitest';
import {
  noteHtmlEquivalentIgnoringScripturePills,
  notePlainTextEquivalent,
  planTruncatedDraftRestore,
  unwrapScripturePills,
} from '../note-draft-staleness';

const pill = (ref: string, text = ref) =>
  `<span class="scripture-pill scripture-pill-clickable" data-scripture-reference="${ref}" data-note-id="pending" style="border-radius: 12px;">${text}</span>`;

describe('unwrapScripturePills', () => {
  it('drops pill spans but keeps their text', () => {
    expect(unwrapScripturePills(`<p>See ${pill('Romans 8:1')} today</p>`)).toBe(
      '<p>See Romans 8:1 today</p>',
    );
  });

  it('leaves non-pill spans intact', () => {
    const html = '<p><span class="highlight">kept</span></p>';
    expect(unwrapScripturePills(html)).toBe(html);
  });

  it('unwraps only the pill when a plain span is nested inside it', () => {
    const nested = `<span class="scripture-pill" data-scripture-reference="John 3:16"><span class="x">John 3:16</span></span>`;
    expect(unwrapScripturePills(`<p>${nested}</p>`)).toBe('<p><span class="x">John 3:16</span></p>');
  });

  it('keeps a plain span that follows a pill (depth tracking, not lazy pairing)', () => {
    const html = `<p>${pill('Acts 2:1')}<span class="after">tail</span></p>`;
    expect(unwrapScripturePills(html)).toBe('<p>Acts 2:1<span class="after">tail</span></p>');
  });
});

describe('noteHtmlEquivalentIgnoringScripturePills', () => {
  it('treats server pill markup as equivalent to the plain reference the editor sent', () => {
    expect(
      noteHtmlEquivalentIgnoringScripturePills(
        '<p>Read Romans 8:1 tonight</p>',
        `<p>Read ${pill('Romans 8:1')} tonight</p>`,
      ),
    ).toBe(true);
  });

  it('does NOT treat a formatting-only change as equivalent — that is real unsaved work', () => {
    expect(
      noteHtmlEquivalentIgnoringScripturePills('<p><strong>grace</strong></p>', '<p>grace</p>'),
    ).toBe(false);
  });

  it('reports genuinely different text as different', () => {
    expect(
      noteHtmlEquivalentIgnoringScripturePills('<p>one</p>', '<p>one</p><p>two</p>'),
    ).toBe(false);
  });

  it('ignores blank-paragraph serialization drift', () => {
    expect(noteHtmlEquivalentIgnoringScripturePills('<p></p><p>a</p>', '<p><br></p>\n<p>a</p>')).toBe(
      true,
    );
  });
});

describe('notePlainTextEquivalent', () => {
  it('ignores all markup, including formatting', () => {
    expect(notePlainTextEquivalent('<p><strong>grace</strong></p>', '<p>grace</p>')).toBe(true);
  });

  it('still separates different words', () => {
    expect(notePlainTextEquivalent('<p>grace</p>', '<p>peace</p>')).toBe(false);
  });

  it('matches a pill-ified server body against the plain reference the editor sent', () => {
    // Regression: stripHtml renders a pill as "Romans 8:1 NET" — reference plus translation
    // abbreviation — so stripping before unwrapping made this pair permanently unequal.
    expect(
      notePlainTextEquivalent(`<p>Read ${pill('Romans 8:1')} tonight</p>`, '<p>Read Romans 8:1 tonight</p>'),
    ).toBe(true);
  });
});

describe('planTruncatedDraftRestore', () => {
  const full = '<p>one</p><p>two</p><p>three</p>';
  const preview = '<p>one</p><p>two</p>';

  it('merges the draft with the tail the server has past the seam', () => {
    const plan = planTruncatedDraftRestore({
      draftContent: '<p>one</p><p>two EDITED</p>',
      draftPreviewHtml: preview,
      draftPreviewLength: preview.length,
      serverContent: full,
      serverIsTruncated: false,
    });
    expect(plan).toEqual({
      action: 'restore-merged',
      content: '<p>one</p><p>two EDITED</p><p>three</p>',
    });
  });

  it('drops the draft when the seam no longer matches the server body', () => {
    expect(
      planTruncatedDraftRestore({
        draftContent: '<p>one</p><p>two EDITED</p>',
        draftPreviewHtml: preview,
        draftPreviewLength: preview.length,
        serverContent: '<p>rewritten entirely</p>',
        serverIsTruncated: false,
      }),
    ).toEqual({ action: 'skip-clear' });
  });

  it('restores plainly when the seam is valid but there is no tail left', () => {
    expect(
      planTruncatedDraftRestore({
        draftContent: '<p>one</p><p>two EDITED</p>',
        draftPreviewHtml: preview,
        draftPreviewLength: preview.length,
        serverContent: preview,
        serverIsTruncated: false,
      }),
    ).toEqual({ action: 'restore' });
  });

  it('restores plainly when this open has the same seam it was drafted from', () => {
    expect(
      planTruncatedDraftRestore({
        draftContent: '<p>one</p><p>two EDITED</p>',
        draftPreviewHtml: preview,
        draftPreviewLength: preview.length,
        serverContent: preview,
        serverIsTruncated: true,
        serverPreviewLength: preview.length,
      }),
    ).toEqual({ action: 'restore' });
  });

  it('keeps the draft for later when this open is a different preview', () => {
    expect(
      planTruncatedDraftRestore({
        draftContent: '<p>one</p><p>two EDITED</p>',
        draftPreviewHtml: preview,
        draftPreviewLength: preview.length,
        serverContent: '<p>one</p>',
        serverIsTruncated: true,
        serverPreviewLength: 10,
      }),
    ).toEqual({ action: 'skip-keep' });
  });

  it('drops a seamless legacy draft whose text the full body already contains', () => {
    expect(
      planTruncatedDraftRestore({
        draftContent: preview,
        serverContent: full,
        serverIsTruncated: false,
      }),
    ).toEqual({ action: 'skip-clear' });
  });

  it('restores a seamless legacy draft that says something the full body does not', () => {
    expect(
      planTruncatedDraftRestore({
        draftContent: '<p>one</p><p>two EDITED</p>',
        serverContent: full,
        serverIsTruncated: false,
      }),
    ).toEqual({ action: 'restore' });
  });
});
