import { describe, expect, it } from 'vitest';
import {
  libraryMoveSound,
  libraryViewDepth,
  type LibraryPanelView,
} from '../library-panel-view';

const tab = (t: LibraryPanelView['tab']): LibraryPanelView => ({ tab: t, drill: null });
const thread: LibraryPanelView = { tab: 'threads', drill: { kind: 'thread', threadId: 't1' } };
const otherThread: LibraryPanelView = { tab: 'threads', drill: { kind: 'thread', threadId: 't2' } };
const books: LibraryPanelView = {
  tab: 'scripture',
  drill: { kind: 'scripture', drill: { level: 'books' } },
};
const passages: LibraryPanelView = {
  tab: 'scripture',
  drill: { kind: 'scripture', drill: { level: 'passages', bookOrder: 43 } },
};
const passageNotes: LibraryPanelView = {
  tab: 'scripture',
  drill: { kind: 'scripture', drill: { level: 'notes', bookOrder: 43, passageKey: '43:3' } },
};

describe('how deep a view is', () => {
  it('counts a tab as the top and each drill one step in', () => {
    expect(libraryViewDepth(null)).toBe(0);
    expect(libraryViewDepth(tab('all'))).toBe(0);
    expect(libraryViewDepth(thread)).toBe(1);
    expect(libraryViewDepth(books)).toBe(1);
    expect(libraryViewDepth(passages)).toBe(2);
    expect(libraryViewDepth(passageNotes)).toBe(3);
  });
});

describe('the sound a move makes', () => {
  it('goes forward into a drill and back out of it', () => {
    expect(libraryMoveSound(tab('threads'), thread)).toBe('nav.forward');
    expect(libraryMoveSound(thread, tab('threads'))).toBe('nav.back');
    expect(libraryMoveSound(books, passages)).toBe('nav.forward');
    expect(libraryMoveSound(passageNotes, passages)).toBe('nav.back');
  });

  it('is a choice, not a journey, when stepping sideways between tabs', () => {
    expect(libraryMoveSound(tab('all'), tab('notes'))).toBe('nav.select');
  });

  it('still goes somewhere when one drill replaces another on the same tab', () => {
    expect(libraryMoveSound(thread, otherThread)).toBe('nav.forward');
  });

  it('is silent when nothing moved, or when there was no panel to move in', () => {
    expect(libraryMoveSound(thread, { ...thread })).toBeNull();
    expect(libraryMoveSound(null, thread)).toBeNull();
  });
});
