import { describe, expect, it } from 'vitest';
import { resolvePaperStackFlipUp, type PaperStackFlipHelpers } from '../paper-stack-flip';
import type {
  PaperStackOrigin,
  PaperStackReturnTo,
  PaperStackState,
} from '../../../layouts/proto-shell-context';

/**
 * Tapping a parked note's edge has to bring the note back. It used to "dismiss" it instead
 * whenever the note had been flipped down while the URL already stood on the reader: the
 * flip-down recorded no address, the flip-up opened the sheet without navigating, and on
 * `/read/...` the shell renders the chapter — so the note vanished and the reader stayed.
 */

const helpers: PaperStackFlipHelpers = {
  noteIdAt: (p) => (p.startsWith('/note-') ? p.slice('/note-'.length) : null),
  noteRoute: (noteId) => ({
    to: '/$noteId',
    params: { noteId },
    search: { space: 'church' },
  }),
};

const readerOrigin: PaperStackOrigin = {
  kind: 'reader',
  label: '2 Timothy 1',
  icon: 'scroll',
  returnTo: { to: '/read/$book/$chapter', params: { book: '2-timothy', chapter: '1' } },
  base: { type: 'reader', book: '2 Timothy', chapter: 1, translation: 'NET' },
};

const homeOrigin: PaperStackOrigin = {
  kind: 'homeCard',
  cardKind: 'revisitNote',
  label: 'Worth another look',
  icon: 'arrow-rotate-left',
  returnTo: { to: '/' },
  base: { type: 'originCard', title: 'A note', icon: 'arrow-rotate-left' },
};

const parked = (
  origin: PaperStackOrigin,
  noteId?: string,
  parkedAt?: PaperStackReturnTo,
): PaperStackState => ({ origin, noteId, noteTitle: 'Fighting with fear', open: false, parkedAt });

describe('resolvePaperStackFlipUp', () => {
  it('brings a note flipped down on its reader URL back to its own route', () => {
    // Flipped down while the URL was already /read/... — nothing recorded.
    const stack = parked(readerOrigin, 'note_fear');
    expect(resolvePaperStackFlipUp(stack, '/read/2-timothy/1', helpers)).toEqual({
      to: '/$noteId',
      params: { noteId: 'note_fear' },
      search: { space: 'church' },
    });
  });

  it('does the same for a reader that has been browsed on since', () => {
    const stack = parked(readerOrigin, 'note_fear');
    expect(resolvePaperStackFlipUp(stack, '/read/2-timothy/2', helpers)?.params).toEqual({
      noteId: 'note_fear',
    });
  });

  it('prefers the address recorded when the sheet went down', () => {
    const at = { to: '/note-note_fear', search: { space: 'home' } };
    expect(resolvePaperStackFlipUp(parked(readerOrigin, 'note_fear', at), '/read/2-timothy/1', helpers)).toBe(at);
  });

  it('leaves a compose draft with no address where it is', () => {
    expect(resolvePaperStackFlipUp(parked(readerOrigin), '/read/2-timothy/1', helpers)).toBeNull();
    expect(resolvePaperStackFlipUp(parked(homeOrigin), '/', helpers)).toBeNull();
  });

  it('does not navigate when the URL already names the note', () => {
    expect(resolvePaperStackFlipUp(parked(homeOrigin, 'note_fear'), '/note-note_fear', helpers)).toBeNull();
  });

  it('brings a Home card note back to its route', () => {
    expect(resolvePaperStackFlipUp(parked(homeOrigin, 'note_fear'), '/', helpers)?.to).toBe('/$noteId');
  });

  it('never routes a chapter sheet or a dock-expanded reader', () => {
    const sheet: PaperStackState = {
      origin: readerOrigin,
      sheet: { type: 'reader', book: 'Daniel', chapter: 3, translation: 'NABRE' },
      open: false,
    };
    expect(resolvePaperStackFlipUp(sheet, '/read/daniel/3', helpers)).toBeNull();
    const dock: PaperStackState = {
      origin: { ...readerOrigin, kind: 'noteDock' },
      noteId: 'note_fear',
      open: false,
    };
    expect(resolvePaperStackFlipUp(dock, '/read/2-timothy/1', helpers)).toBeNull();
    expect(resolvePaperStackFlipUp(null, '/', helpers)).toBeNull();
  });
});
