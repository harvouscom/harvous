import { describe, expect, it } from 'vitest';
import {
  resolvePaperStackAfterNavigation,
  type PaperStackPathHelpers,
} from '../paper-stack-teardown';
import type { PaperStackOrigin, PaperStackState } from '../../../layouts/proto-shell-context';

/**
 * Opening an existing note from the reader used to stamp the note id onto the stack
 * while the URL was still `/read/...`. Teardown treats that snapshot as "a chapter
 * opened while the note was up" and clears the stack in the same frame — the note
 * paper flashes, then you are back on the chapter.
 *
 * Compose already avoids this: it stacks without an id, and teardown adopts when
 * `/{noteId}` lands. Opening a margin note has to use that same shape.
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

describe('opening a margin note from the reader',
  () => {
    it('clears if the note id is stamped while still on the chapter — that is the flash',
      () => {
        expect(
          resolvePaperStackAfterNavigation(stacked('n1'), '/read/exodus/5', helpers),
        ).toBe('clear');
      },
    );

    it('keeps the stack on the chapter when the id is not stamped yet',
      () => {
        expect(
          resolvePaperStackAfterNavigation(stacked(), '/read/exodus/5', helpers),
        ).toBe('keep');
      },
    );

    it('adopts the id once the note route lands',
      () => {
        expect(
          resolvePaperStackAfterNavigation(stacked(), '/note-n1', helpers),
        ).toEqual({ adoptNoteId: 'n1' });
      },
    );

    it('then keeps the stacked note',
      () => {
        expect(
          resolvePaperStackAfterNavigation(stacked('n1'), '/note-n1', helpers),
        ).toBe('keep');
      },
    );
  },
);
