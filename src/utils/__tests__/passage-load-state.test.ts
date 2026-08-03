import { describe, it, expect } from 'vitest';
import {
  isTranslationUnavailableHtml,
  passageErrorMessage,
  passageHtmlOf,
  passageStateFromResult,
  type PassageLoadState,
} from '../passage-load-state';

describe('isTranslationUnavailableHtml', () => {
  // These three come from server/utils/fetch-verse-text.ts and arrive as SUCCESSFUL responses.
  it('recognizes the passage-level message', () => {
    expect(
      isTranslationUnavailableHtml('<p><em>This passage is not included in the MSG translation.</em></p>'),
    ).toBe(true);
  });

  it('recognizes the verse-level message', () => {
    expect(
      isTranslationUnavailableHtml('<p><em>This verse is not included in the NLT translation.</em></p>'),
    ).toBe(true);
  });

  it('recognizes the verse-range message', () => {
    expect(
      isTranslationUnavailableHtml(
        '<p><em>Verses 3-5 are not included in the ESV translation.</em></p>',
      ),
    ).toBe(true);
  });

  it('does not match real passage text', () => {
    expect(isTranslationUnavailableHtml('<p><sup>13</sup>That evening vast numbers of quail…</p>')).toBe(
      false,
    );
    expect(isTranslationUnavailableHtml('')).toBe(false);
  });
});

describe('passageStateFromResult', () => {
  it('maps real HTML to loaded', () => {
    const state = passageStateFromResult({ ok: true, html: '<p>That evening…</p>' });
    expect(state.kind).toBe('loaded');
    expect(passageHtmlOf(state)).toBe('<p>That evening…</p>');
  });

  it('maps a translation-gap message to unavailable, not error', () => {
    const html = '<p><em>This verse is not included in the NLT translation.</em></p>';
    const state = passageStateFromResult({ ok: true, html });
    expect(state.kind).toBe('unavailable');
    // Still renders its body — the user needs to read why, and retry would be pointless.
    expect(passageHtmlOf(state)).toBe(html);
    expect(passageErrorMessage(state)).toBeNull();
  });

  it('maps a 200 with an empty body to empty', () => {
    expect(passageStateFromResult({ ok: true, html: '' }).kind).toBe('empty');
    expect(passageStateFromResult({ ok: true, html: '   ' }).kind).toBe('empty');
  });

  it('maps failures to error with the reason preserved', () => {
    expect(passageStateFromResult({ ok: false, reason: 'notFound' })).toEqual({
      kind: 'error',
      reason: 'notFound',
    });
    expect(passageStateFromResult({ ok: false, reason: 'network' }).kind).toBe('error');
  });
});

describe('render invariants', () => {
  it('idle and loading never produce error copy — the first-frame flash guard', () => {
    // The old code rendered "Could not load this passage." for any non-loading state with no HTML,
    // which included the frame before the request started.
    const idle: PassageLoadState = { kind: 'idle' };
    const loading: PassageLoadState = { kind: 'loading' };
    expect(passageErrorMessage(idle)).toBeNull();
    expect(passageErrorMessage(loading)).toBeNull();
    expect(passageHtmlOf(idle)).toBe('');
    expect(passageHtmlOf(loading)).toBe('');
  });

  it('gives a distinct message per failure reason', () => {
    expect(passageErrorMessage({ kind: 'error', reason: 'notFound' })).toBe(
      "We couldn't find that passage.",
    );
    expect(passageErrorMessage({ kind: 'error', reason: 'badRequest' })).toBe(
      "We couldn't read that reference.",
    );
    expect(passageErrorMessage({ kind: 'error', reason: 'network' })).toBe(
      "Couldn't load this passage.",
    );
    expect(passageErrorMessage({ kind: 'empty' })).toBe('No text was returned for this passage.');
  });
});
