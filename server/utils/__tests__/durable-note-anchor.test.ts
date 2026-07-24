import { describe, expect, it } from 'vitest';
import {
  buildLegacyAnchorMigrationPatch,
  createDurableNoteAnchorFromHtml,
  createDurableNoteAnchorFromText,
  durableAnchorValidityReason,
  durableAnchorResolutionPatch,
  legacyAnchorMigrationStateMatches,
  resolveDurableNoteAnchorInHtml,
  resolveDurableNoteAnchorInText,
  tipTapHtmlToCanonicalText,
} from '../durable-note-anchor';

describe('durable note anchors', () => {
  it('normalizes TipTap HTML, entities, Unicode, NBSP, and block boundaries', () => {
    expect(
      tipTapHtmlToCanonicalText(
        '<p>Cafe\u0301&nbsp;&amp; <strong>grace</strong></p><p>Second<br>Third &#x1F64F;</p>',
      ),
    ).toBe('Café & grace\nSecond\nThird 🙏');
    expect(tipTapHtmlToCanonicalText('alpha\r\nbeta\u00a0gamma')).toBe('alpha\nbeta gamma');
    expect(tipTapHtmlToCanonicalText('<p>a&nbsp;&nbsp;b  c</p>')).toBe('a  b  c');
  });

  it('never parses already-canonical literal entity or tag text twice', () => {
    const canonicalText = 'literal &amp; then <strong> and &';
    const entityStart = canonicalText.indexOf('&amp;');
    const entityAnchor = createDurableNoteAnchorFromText({
      text: canonicalText,
      start: entityStart,
      end: entityStart + '&amp;'.length,
    });
    expect(entityAnchor.quote).toBe('&amp;');
    expect(resolveDurableNoteAnchorInText(canonicalText, entityAnchor)).toEqual({
      status: 'resolved',
      start: entityStart,
      end: entityStart + '&amp;'.length,
      strategy: 'prior-range',
    });

    const html = '<p>literal &amp;amp; then &lt;strong&gt; and &amp;</p>';
    expect(tipTapHtmlToCanonicalText(html)).toBe(canonicalText);
    const tagAnchor = createDurableNoteAnchorFromHtml({
      html,
      start: canonicalText.indexOf('<strong>'),
      end: canonicalText.indexOf('<strong>') + '<strong>'.length,
    });
    expect(tagAnchor.quote).toBe('<strong>');
    expect(resolveDurableNoteAnchorInHtml(html, tagAnchor)).toMatchObject({
      status: 'resolved',
      start: canonicalText.indexOf('<strong>'),
    });
  });

  it('keeps an exact quote at its prior range before searching elsewhere', () => {
    expect(
      resolveDurableNoteAnchorInText('mercy and grace and grace', {
        quote: 'grace',
        prefixContext: '',
        suffixContext: '',
        start: 10,
        end: 15,
      }),
    ).toEqual({ status: 'resolved', start: 10, end: 15, strategy: 'prior-range' });
  });

  it('re-anchors a moved quote only when quote and context are unique', () => {
    const original = 'Paul writes that grace is sufficient for us.';
    const anchor = createDurableNoteAnchorFromText({
      text: original,
      start: original.indexOf('grace'),
      end: original.indexOf('grace') + 'grace'.length,
      contextLength: 8,
    });
    const edited = `Introduction. ${original}`;

    expect(resolveDurableNoteAnchorInText(edited, anchor)).toEqual({
      status: 'resolved',
      start: edited.indexOf('grace'),
      end: edited.indexOf('grace') + 'grace'.length,
      strategy: 'quote-context',
    });
  });

  it('uses context to disambiguate repeated exact quotes', () => {
    const content = 'first grace ending; second grace remains';
    expect(
      resolveDurableNoteAnchorInText(content, {
        quote: 'grace',
        prefixContext: 'second ',
        suffixContext: ' remains',
        start: null,
        end: null,
      }),
    ).toEqual({
      status: 'resolved',
      start: content.lastIndexOf('grace'),
      end: content.lastIndexOf('grace') + 'grace'.length,
      strategy: 'quote-context',
    });
  });

  it('detaches rather than guessing between ambiguous matches', () => {
    expect(
      resolveDurableNoteAnchorInText('grace then grace', {
        quote: 'grace',
        prefixContext: '',
        suffixContext: '',
        start: null,
        end: null,
      }),
    ).toEqual({
      status: 'detached',
      start: null,
      end: null,
      strategy: null,
      reason: 'ambiguous-quote',
    });
  });

  it('detaches when the quote is missing or its context no longer matches', () => {
    expect(
      resolveDurableNoteAnchorInText('mercy remains', {
        quote: 'grace',
        prefixContext: '',
        suffixContext: '',
        start: 0,
        end: 5,
      }),
    ).toMatchObject({ status: 'detached', reason: 'missing-quote' });
    expect(
      resolveDurableNoteAnchorInText('new grace setting', {
        quote: 'grace',
        prefixContext: 'old ',
        suffixContext: ' context',
        start: null,
        end: null,
      }),
    ).toMatchObject({ status: 'detached', reason: 'context-mismatch' });
  });

  it('maps resolved and detached results to durable persistence fields', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    expect(
      durableAnchorResolutionPatch(
        { status: 'resolved', start: 2, end: 7, strategy: 'quote-context' },
        now,
      ),
    ).toEqual({
      anchorStatus: 'resolved',
      resolvedAnchorStart: 2,
      resolvedAnchorEnd: 7,
      anchorResolvedAt: now,
      anchorDetachedAt: null,
    });
    expect(
      durableAnchorResolutionPatch(
        {
          status: 'detached',
          start: null,
          end: null,
          strategy: null,
          reason: 'missing-quote',
        },
        now,
      ),
    ).toMatchObject({
      anchorStatus: 'detached',
      resolvedAnchorStart: null,
      resolvedAnchorEnd: null,
      anchorDetachedAt: now,
    });
  });

  it('migrates legacy anchors against normalized baseline text', () => {
    const baselineContent = '<p>Grace &amp; peace</p><p>Mercy remains</p>';
    const rendered = tipTapHtmlToCanonicalText(baselineContent);
    const migratedAt = new Date('2026-07-09T12:00:00Z');
    const patch = buildLegacyAnchorMigrationPatch({
      baselineVersionId: 'nver_1',
      baselineContent,
      anchorLocation: rendered.indexOf('Mercy'),
      anchorLength: 'Mercy'.length,
      anchorTextSnapshot: 'Mercy',
      sourceSnippet: null,
      migratedAt,
    });

    expect(patch).toMatchObject({
      noteVersionId: 'nver_1',
      anchorQuote: 'Mercy',
      anchorStatus: 'resolved',
      resolvedAnchorStart: rendered.indexOf('Mercy'),
      resolvedAnchorEnd: rendered.indexOf('Mercy') + 'Mercy'.length,
      anchorResolvedAt: migratedAt,
      anchorDetachedAt: null,
    });
  });

  it('preserves literal rendered entities and tags during legacy migration', () => {
    const baselineContent = '<p>literal &amp;amp; then &lt;strong&gt; and &amp;</p>';
    const canonicalText = 'literal &amp; then <strong> and &';
    const migratedAt = new Date('2026-07-09T12:00:00Z');
    for (const quote of ['&amp;', '<strong>']) {
      const start = canonicalText.indexOf(quote);
      expect(
        buildLegacyAnchorMigrationPatch({
          baselineVersionId: 'nver_1',
          baselineContent,
          anchorLocation: start,
          anchorLength: quote.length,
          anchorTextSnapshot: quote,
          sourceSnippet: null,
          migratedAt,
        }),
      ).toMatchObject({
        anchorStatus: 'resolved',
        anchorQuote: quote,
        resolvedAnchorStart: start,
        resolvedAnchorEnd: start + quote.length,
      });
    }
  });

  it('detects concurrent legacy anchor edits before migration writes', () => {
    const expected = {
      noteVersionId: null,
      anchorStatus: 'unresolved',
      anchorLocation: 3,
      anchorLength: 5,
      anchorTextSnapshot: 'grace',
      sourceSnippet: 'grace',
      updatedAt: new Date('2026-07-09T12:00:00Z'),
    };
    expect(legacyAnchorMigrationStateMatches(expected, { ...expected })).toBe(true);
    expect(legacyAnchorMigrationStateMatches(expected, { ...expected, anchorTextSnapshot: 'mercy' })).toBe(false);
    expect(
      legacyAnchorMigrationStateMatches(expected, {
        ...expected,
        updatedAt: new Date('2026-07-09T12:00:01Z'),
      }),
    ).toBe(false);
  });

  it('detaches ambiguous legacy quotes and orphans entries without a selector', () => {
    const migratedAt = new Date('2026-07-09T12:00:00Z');
    expect(
      buildLegacyAnchorMigrationPatch({
        baselineVersionId: 'nver_1',
        baselineContent: '<p>grace then grace</p>',
        anchorLocation: null,
        anchorLength: null,
        anchorTextSnapshot: 'grace',
        sourceSnippet: null,
        migratedAt,
      }),
    ).toMatchObject({ anchorStatus: 'detached', anchorQuote: 'grace', anchorDetachedAt: migratedAt });
    expect(
      buildLegacyAnchorMigrationPatch({
        baselineVersionId: 'nver_1',
        baselineContent: '<p>grace</p>',
        anchorLocation: null,
        anchorLength: null,
        anchorTextSnapshot: null,
        sourceSnippet: '',
        migratedAt,
      }),
    ).toMatchObject({ anchorStatus: 'orphaned', anchorQuote: null, anchorDetachedAt: migratedAt });
  });

  it('validates durable anchor/version integrity using rendered text', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const row = {
      parentNoteId: 'note_1',
      noteVersionId: 'nver_1',
      anchorQuote: 'grace',
      anchorPrefixContext: '',
      anchorSuffixContext: '',
      anchorStatus: 'resolved',
      resolvedAnchorStart: 0,
      resolvedAnchorEnd: 5,
      anchorResolvedAt: now,
      anchorDetachedAt: null,
    };
    expect(
      durableAnchorValidityReason(row, {
        id: 'nver_1',
        noteId: 'note_1',
        content: '<p>grace remains</p>',
      }),
    ).toBeNull();
    expect(
      durableAnchorValidityReason({ ...row, resolvedAnchorStart: 1, resolvedAnchorEnd: 6 }, {
        id: 'nver_1',
        noteId: 'note_1',
        content: '<p>grace remains</p>',
      }),
    ).toBe('stale-resolved-anchor');
    expect(
      durableAnchorValidityReason(
        {
          ...row,
          anchorStatus: 'detached',
          resolvedAnchorStart: null,
          resolvedAnchorEnd: null,
          anchorResolvedAt: null,
          anchorDetachedAt: now,
        },
        { id: 'nver_1', noteId: 'note_1', content: '<p>grace remains</p>' },
      ),
    ).toBe('detached-anchor-resolves');
  });
});
