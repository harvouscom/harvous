import { describe, expect, it } from 'vitest';
import {
  resolvePaperStackAfterNavigation,
  type PaperStackPathHelpers,
} from '../paper-stack-teardown';
import type { PaperStackOrigin, PaperStackState } from '../../../layouts/proto-shell-context';

/**
 * Opening an existing note from the reader stamps the note id onto the stack while the URL
 * is still `/read/...`. That snapshot used to clear as "a chapter opened while the note was
 * up". The origin chapter now keeps the stack so the note route can land and adopt.
 */

const helpers: PaperStackPathHelpers = {
  isNotePath: (p) => /^\/note-/.test(p),
  noteIdAt: (p) => (p.startsWith('/note-') ? p.slice('/note-'.length) : null),
  isReadPath: (p) => p.startsWith('/read/'),
  readTargetAt: (p) => {
    const m = /^\/read\/([^/]+)\/([^/]+)$/.exec(p);
    return m ? { book: m[1], chapter: Number(m[2]) } : null;
  },
  isHomePath: (p) => p === '/',
};

const readerOrigin: PaperStackOrigin = {
  kind: 'reader',
  label: 'Exodus 5',
  icon: 'scroll',
  returnTo: { to: '/read', params: { book: 'exodus', chapter: '5' } },
  base: { type: 'reader', book: 'Exodus', chapter: 5, translation: 'NLT' },
};

const stacked = (noteId?: string): PaperStackState => ({
  origin: readerOrigin,
  noteId,
  open: true,
});

describe('opening a margin note from the reader', () => {
  it('keeps the stack if the note id is stamped while still on the origin chapter', () => {
    expect(
      resolvePaperStackAfterNavigation(stacked('n1'), '/read/exodus/5', helpers),
    ).toBe('keep');
  });

  it('keeps the stack on the chapter when the id is not stamped yet', () => {
    expect(
      resolvePaperStackAfterNavigation(stacked(), '/read/exodus/5', helpers),
    ).toBe('keep');
  });

  it('adopts the id once the note route lands', () => {
    expect(
      resolvePaperStackAfterNavigation(stacked(), '/note-n1', helpers),
    ).toEqual({ adoptNoteId: 'n1' });
  });

  it('then keeps the stacked note', () => {
    expect(
      resolvePaperStackAfterNavigation(stacked('n1'), '/note-n1', helpers),
    ).toBe('keep');
  });
});
