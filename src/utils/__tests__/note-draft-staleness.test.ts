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

  it('drops a stale pre-merge draft instead of duplicating its own text (regression)', () => {
    // Reproduces the duplication bug: the draft was written just before an earlier
    // session spliced the real tail onto exactly this draft content and saved it. The
    // seam still validates (nothing before the seam changed), but concatenating a tail
    // sliced from the now-already-merged server body would repeat "two EDITED".
    const draftContent = '<p>one</p><p>two EDITED</p>';
    const alreadyMergedServerContent = '<p>one</p><p>two EDITED</p><p>three</p>';
    expect(
      planTruncatedDraftRestore({
        draftContent,
        draftPreviewHtml: preview,
        draftPreviewLength: preview.length,
        serverContent: alreadyMergedServerContent,
        serverIsTruncated: false,
      }),
    ).toEqual({ action: 'skip-clear' });
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

describe('planTruncatedDraftRestore — server re-marked the body after the seam', () => {
  const seam = '<p>Opening thoughts</p>';

  it('drops the draft instead of appending its own words back onto the note', () => {
    /*
      The reported bug: content duplicated between the PWA and the desktop, and deleting the
      duplicate brought it back.

      The seam still validates because scripture processing rewrote the body *after* the seam
      offset — it wraps a bare reference in pill markup on every save
      (transformCanonicalScriptureContent). The old guard here was a literal
      `serverContent.startsWith(draftContent)`, which markup drift defeats, so the merge below
      spliced the draft's own paragraph onto a server body that already contained it. The draft
      is per-device, so erasing the result on one device left the other free to re-post it.
    */
    const draftContent = `${seam}<p>Romans 8:1</p>`;
    const serverContent =
      `${seam}<p><span data-scripture-reference="Romans 8:1" data-note-id="note_1" ` +
      `data-scripture-translation="NET" class="scripture-pill">Romans 8:1</span></p><p>Later thought</p>`;

    const plan = planTruncatedDraftRestore({
      draftContent,
      draftPreviewHtml: seam,
      draftPreviewLength: seam.length,
      serverContent,
      serverIsTruncated: false,
    });

    expect(plan.action).toBe('skip-clear');
  });

  it('still merges a genuine tail the draft never saw', () => {
    // The case the merge exists for must keep working: the draft says something the server
    // does not, so its words are real unsaved work and the server's tail is real new content.
    const draftContent = `${seam}<p>My unsaved sentence</p>`;
    const serverContent = `${seam}<p>Someone else's later paragraph</p>`;

    const plan = planTruncatedDraftRestore({
      draftContent,
      draftPreviewHtml: seam,
      draftPreviewLength: seam.length,
      serverContent,
      serverIsTruncated: false,
    });

    expect(plan.action).toBe('restore-merged');
    if (plan.action === 'restore-merged') {
      expect(plan.content).toContain('My unsaved sentence');
      expect(plan.content).toContain("Someone else's later paragraph");
      expect(plan.content.split('My unsaved sentence').length - 1).toBe(1);
    }
  });
});
