import { describe, expect, it } from 'vitest';
import {
  resolvePaperStackAfterNavigation,
  type PaperStackPathHelpers,
} from '../paper-stack-teardown';
import type { PaperStackOrigin, PaperStackState } from '../../../layouts/proto-shell-context';

/**
 * A stack that never cleared was the bug this module exists to fix: once stacked, the
 * reader stayed mounted behind every later route. Every row of the verdict table is here,
 * so the next origin kind cannot quietly regress it.
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
  label: 'John 15',
  icon: 'scroll',
  returnTo: { to: '/read', params: { book: 'John', chapter: '15' } },
  base: { type: 'reader', book: 'John', chapter: 15, translation: 'NLT' },
};

const homeOrigin: PaperStackOrigin = {
  kind: 'homeCard',
  cardKind: 'revisitNote',
  label: 'Worth another look',
  icon: 'arrow-rotate-left',
  returnTo: { to: '/' },
  base: { type: 'originCard', title: 'A note', icon: 'arrow-rotate-left' },
};

const reviewOrigin: PaperStackOrigin = {
  kind: 'reviewCard',
  review: { itemId: 'review_1', attempted: true, attempt: 'something about adoption' },
  label: 'Review',
  icon: 'arrows-rotate',
  returnTo: { to: '/' },
  base: {
    type: 'originCard',
    eyebrow: 'Review',
    title: 'Before opening it, what did you observe in My journey?',
    icon: 'arrows-rotate',
  },
};

const noteDockOrigin: PaperStackOrigin = {
  kind: 'noteDock',
  label: 'Grace and law',
  icon: 'note-sticky',
  returnTo: { to: '/note', params: { noteId: 'abc' }, search: { scriptureRef: 'Romans 8:28' } },
  base: { type: 'originCard', title: 'Grace and law', icon: 'note-sticky' },
};

const stacked = (origin: PaperStackOrigin, noteId?: string): PaperStackState => ({
  origin,
  noteId,
  open: true,
});

/** The same stack with the sheet flipped down — the reader is the paper in front. */
const parked = (origin: PaperStackOrigin, noteId: string): PaperStackState => ({
  origin,
  noteId,
  open: false,
});

describe('resolvePaperStackAfterNavigation', () => {
  it('has nothing to say when nothing is stacked', () => {
    expect(resolvePaperStackAfterNavigation(null, '/settings', helpers)).toBe('keep');
  });

  describe('reader origin (reader is the base, a note is the sheet)', () => {
    it('keeps the stack on the stacked note', () => {
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin, 'n1'), '/note-n1', helpers)).toBe('keep');
    });

    it('adopts the id when a compose draft saves', () => {
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin), '/note-n9', helpers)).toEqual({
        adoptNoteId: 'n9',
      });
    });

    it('clears when a different note opens — that note did not come from this reader', () => {
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin, 'n1'), '/note-n2', helpers)).toBe('clear');
    });

    it('keeps the stack across chapters while flipped down', () => {
      expect(resolvePaperStackAfterNavigation(parked(readerOrigin, 'n1'), '/read/John/15', helpers)).toBe('keep');
      expect(resolvePaperStackAfterNavigation(parked(readerOrigin, 'n1'), '/read/John/17', helpers)).toBe('keep');
    });

    /**
     * The one that costs something to get wrong.
     *
     * The sheet renders whatever the route is, so keeping the stack here swapped the note for
     * a second reader — two chapters stacked on each other, and the draft the stack existed to
     * hold unmounted with the note. A chapter opened while the note is UP is leaving the note.
     */
    it('clears when a chapter opens while the note is still up', () => {
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin, 'n1'), '/read/John/15', helpers)).toBe(
        'clear',
      );
    });

    it('clears on Home and on anything unrelated', () => {
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin, 'n1'), '/', helpers)).toBe('clear');
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin, 'n1'), '/settings', helpers)).toBe('clear');
    });

    /**
     * An unsaved compose draft is still a stack that can be walked away from.
     *
     * The layout used to exempt exactly this shape — a draft with no note id yet — from the
     * whole check whenever the path was not a note path, which meant a draft started from
     * the reader pinned the chapter behind Settings, behind Home, behind everything. The
     * resolver never needed that exemption: it keeps the stack on read paths and adopts on
     * the save navigation, and the case below is why it must be allowed to answer at all.
     */
    it('clears an unsaved compose draft that walks off to somewhere unrelated', () => {
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin), '/settings/account', helpers)).toBe(
        'clear',
      );
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin), '/', helpers)).toBe('clear');
    });

    it('keeps an unsaved compose draft while it is still on the chapter it started from', () => {
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin), '/read/John/15', helpers)).toBe('keep');
    });

    /** ...but a draft carried off to another chapter has left too. */
    it('clears an unsaved compose draft once another chapter opens', () => {
      expect(resolvePaperStackAfterNavigation(stacked(readerOrigin), '/read/John/17', helpers)).toBe(
        'clear',
      );
    });
  });

  describe('homeCard origin (a card is the base, a note is the sheet)', () => {
    it('keeps the stack on the note and on Home', () => {
      expect(resolvePaperStackAfterNavigation(stacked(homeOrigin, 'n1'), '/note-n1', helpers)).toBe('keep');
      expect(resolvePaperStackAfterNavigation(stacked(homeOrigin, 'n1'), '/', helpers)).toBe('keep');
    });

    it('adopts a landing note when the card did not know the note id', () => {
      expect(resolvePaperStackAfterNavigation(stacked(homeOrigin), '/note-n4', helpers)).toEqual({
        adoptNoteId: 'n4',
      });
    });

    it('clears when the reader opens — the reader is its own base, not something Home stands behind', () => {
      expect(resolvePaperStackAfterNavigation(stacked(homeOrigin, 'n1'), '/read/John/1', helpers)).toBe('clear');
    });

    it('clears on a different note and on anything unrelated', () => {
      expect(resolvePaperStackAfterNavigation(stacked(homeOrigin, 'n1'), '/note-n2', helpers)).toBe('clear');
      expect(resolvePaperStackAfterNavigation(stacked(homeOrigin, 'n1'), '/settings', helpers)).toBe('clear');
    });

    it('keeps the edge over the chapter when the card is the one that opened it', () => {
      // The rule above holds because a chapter usually has nothing to do with the card. A
      // passage card is the case where it has everything to do with it: the chapter under the
      // edge is what the card promised, and it is the only thing saying why it is open.
      const passageOrigin: PaperStackOrigin = { ...homeOrigin, cardKind: 'passage' };

      expect(resolvePaperStackAfterNavigation(stacked(passageOrigin), '/read/John/3', helpers)).toBe('keep');
    });

    it('still clears a passage card on anything that is not a chapter', () => {
      const passageOrigin: PaperStackOrigin = { ...homeOrigin, cardKind: 'passage' };

      expect(resolvePaperStackAfterNavigation(stacked(passageOrigin), '/settings', helpers)).toBe('clear');
    });
  });

  describe('noteDock origin (a note is the base, the reader is the sheet)', () => {
    it('keeps the stack across chapters — the reader wanders', () => {
      expect(resolvePaperStackAfterNavigation(stacked(noteDockOrigin, 'abc'), '/read/Romans/8', helpers)).toBe('keep');
      expect(resolvePaperStackAfterNavigation(stacked(noteDockOrigin, 'abc'), '/read/Romans/11', helpers)).toBe('keep');
    });

    it('clears when the origin note is reached without the edge — the stack is over', () => {
      expect(resolvePaperStackAfterNavigation(stacked(noteDockOrigin, 'abc'), '/note-abc', helpers)).toBe('clear');
    });

    it('never adopts — its note is the origin, not the sheet', () => {
      expect(resolvePaperStackAfterNavigation(stacked(noteDockOrigin), '/note-zzz', helpers)).toBe('clear');
    });

    it('clears on Home and on anything unrelated', () => {
      expect(resolvePaperStackAfterNavigation(stacked(noteDockOrigin, 'abc'), '/', helpers)).toBe('clear');
      expect(resolvePaperStackAfterNavigation(stacked(noteDockOrigin, 'abc'), '/settings', helpers)).toBe('clear');
    });
  });
});

describe('reviewCard', () => {
  const stack = (noteId?: string): PaperStackState => ({
    origin: reviewOrigin,
    noteId,
    open: true,
  });

  it('keeps the edge on the note the question is about', () => {
    expect(resolvePaperStackAfterNavigation(stack('a'), '/note-a', helpers)).toBe('keep');
  });

  it('clears on any other note', () => {
    expect(resolvePaperStackAfterNavigation(stack('a'), '/note-b', helpers)).toBe('clear');
  });

  it('clears everywhere that is not a note', () => {
    for (const path of ['/', '/read/John/15', '/review', '/settings']) {
      expect(resolvePaperStackAfterNavigation(stack('a'), path, helpers)).toBe('clear');
    }
  });

  it('does not adopt an unresolvable note path the way a draft origin would', () => {
    /*
     * The generic branch keeps on a note path with no id so a saving compose draft can adopt it.
     * A review card only ever stacks a note that already exists, so an unresolvable path means
     * the reader has gone somewhere else — and a verdict edge over an unrelated page is worse
     * than no edge, because it invites an answer to a question about something off screen.
     */
    const draftLike: PaperStackPathHelpers = { ...helpers, noteIdAt: () => null };
    expect(resolvePaperStackAfterNavigation(stack('a'), '/note-a', draftLike)).toBe('clear');
  });
});
