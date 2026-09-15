import { describe, expect, it } from 'vitest';
import { shouldFallbackUnresolvedScriptureToReader } from '../unresolved-scripture-dock';
import type { PaperStackOrigin, PaperStackState } from '../../../layouts/proto-shell-context';

const readerOrigin: PaperStackOrigin = {
  kind: 'reader',
  label: 'Exodus 5',
  icon: 'scroll',
  returnTo: { to: '/read', params: { book: 'exodus', chapter: '5' } },
  base: { type: 'reader', book: 'Exodus', chapter: 5, translation: 'NLT' },
};

const homeOrigin: PaperStackOrigin = {
  kind: 'homeCard',
  cardKind: 'revisitNote',
  label: 'Worth another look',
  icon: 'arrow-rotate-left',
  returnTo: { to: '/' },
  base: { type: 'originCard', title: 'A note', icon: 'arrow-rotate-left' },
};

const stack = (origin: PaperStackOrigin): PaperStackState => ({
  origin,
  noteId: 'n1',
  open: true,
});

describe('shouldFallbackUnresolvedScriptureToReader', () => {
  it('does not send you back to the chapter you just stacked behind the note', () => {
    expect(shouldFallbackUnresolvedScriptureToReader(stack(readerOrigin))).toBe(false);
  });

  it('still falls back to the reader from Home when the note has no matching pill', () => {
    expect(shouldFallbackUnresolvedScriptureToReader(stack(homeOrigin))).toBe(true);
  });

  it('still falls back when nothing is stacked', () => {
    expect(shouldFallbackUnresolvedScriptureToReader(null)).toBe(true);
  });
});
