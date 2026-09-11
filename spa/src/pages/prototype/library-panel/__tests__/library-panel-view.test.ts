/**
 * The Library panel's pure view layer.
 *
 * The chip's promise — what it says is what expanding it shows — is now kept by both sides
 * saying one thing: the chip reads "Search" and opens the search surface. What is left to
 * test here is the tab ring, the back affordance, and drill identity.
 */
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_CHIP_OPENING_VIEW,
  cycleLibraryTab,
  isSameLibraryPanelView,
  libraryDrillTitle,
  libraryPanelShowsBack,
  shouldAutoFocusLibrarySearch,
  LIBRARY_TABS,
  type LibraryPanelView,
} from '../library-panel-view';

describe('LIBRARY_CHIP_OPENING_VIEW', () => {
  it('is the All tab with nothing drilled', () => {
    // The chip says "Search" in every mode, so it opens the same place in every mode.
    // It used to branch — a note opened its folder, the reader its book — and that went
    // when the chip stopped naming them.
    expect(LIBRARY_CHIP_OPENING_VIEW.tab).toBe('all');
    expect(LIBRARY_CHIP_OPENING_VIEW.drill).toBeNull();
  });

  it('asks for the caret, the same as the chord', () => {
    // A control labelled Search opens ready to search. Whether the caret is actually taken
    // is the panel's call, not the opener's — a finger never gets it.
    expect(LIBRARY_CHIP_OPENING_VIEW.autoFocusSearch).toBe(true);
  });
});

describe('cycleLibraryTab', () => {
  it('walks the seven tabs and wraps', () => {
    let view: LibraryPanelView = { tab: 'all', drill: null };
    const seen: string[] = [];
    for (let i = 0; i < LIBRARY_TABS.length; i += 1) {
      view = cycleLibraryTab(view, 1);
      seen.push(view.tab);
    }
    expect(seen).toEqual(['notes', 'folders', 'threads', 'highlights', 'scripture', 'resources', 'all']);
  });

  it('goes backwards from the first tab to the last', () => {
    expect(cycleLibraryTab({ tab: 'all', drill: null }, -1)).toEqual({
      tab: 'resources',
      drill: null,
    });
  });

  it('clears the drill', () => {
    // "Next tab" landing on a tab still showing one folder's contents would answer a
    // different question than the one the key asked.
    expect(
      cycleLibraryTab({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } }, 1),
    ).toEqual({ tab: 'threads', drill: null });
  });
});

describe('libraryPanelShowsBack', () => {
  it('is off at a bare tab and on once drilled', () => {
    expect(libraryPanelShowsBack({ tab: 'all', drill: null })).toBe(false);
    expect(
      libraryPanelShowsBack({ tab: 'folders', drill: { kind: 'folder', folderKey: null } }),
    ).toBe(true);
  });
});

describe('libraryDrillTitle', () => {
  it('says nothing at a bare tab — the surface has no title of its own', () => {
    expect(libraryDrillTitle({ tab: 'highlights', drill: null })).toBeNull();
  });

  it('names a folder, and Unsorted by name', () => {
    expect(
      libraryDrillTitle({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } }),
    ).toBe('Sermons');
    expect(
      libraryDrillTitle({ tab: 'folders', drill: { kind: 'folder', folderKey: null } }),
    ).toBe('Unsorted');
  });

  it('prefers a resolved subject over what the view carries', () => {
    expect(
      libraryDrillTitle(
        { tab: 'scripture', drill: { kind: 'scripture', drill: { level: 'passages', bookOrder: 45 } } },
        'Romans',
      ),
    ).toBe('Romans');
    expect(
      libraryDrillTitle({ tab: 'threads', drill: { kind: 'thread', threadId: 't1' } }, 'Life in the Spirit'),
    ).toBe('Life in the Spirit');
  });

  it('falls back to the book the drill already knows', () => {
    expect(
      libraryDrillTitle({
        tab: 'scripture',
        drill: { kind: 'scripture', drill: { level: 'passages', bookOrder: 45, bookTitle: 'Romans' } },
      }),
    ).toBe('Romans');
  });
});

describe('isSameLibraryPanelView', () => {
  it('separates Unsorted from the bare Folders tab', () => {
    // Both are "no folder named" in casual speech and two different places here.
    expect(
      isSameLibraryPanelView(
        { tab: 'folders', drill: { kind: 'folder', folderKey: null } },
        { tab: 'folders', drill: null },
      ),
    ).toBe(false);
  });

  it('compares tab and drill together', () => {
    expect(
      isSameLibraryPanelView({ tab: 'all', drill: null }, { tab: 'all', drill: null }),
    ).toBe(true);
    expect(
      isSameLibraryPanelView({ tab: 'all', drill: null }, { tab: 'notes', drill: null }),
    ).toBe(false);
  });

  it('compares scripture drills level by level', () => {
    const at = (drill: { level: 'passages'; bookOrder: number; bookTitle?: string }) =>
      ({ tab: 'scripture', drill: { kind: 'scripture' as const, drill } }) as LibraryPanelView;
    expect(
      isSameLibraryPanelView(at({ level: 'passages', bookOrder: 45 }), at({ level: 'passages', bookOrder: 45, bookTitle: 'Romans' })),
    ).toBe(true);
    expect(
      isSameLibraryPanelView(at({ level: 'passages', bookOrder: 45 }), at({ level: 'passages', bookOrder: 46 })),
    ).toBe(false);
  });

  it('treats a different opening query as a different view', () => {
    expect(
      isSameLibraryPanelView(
        { tab: 'all', drill: null, querySeed: 'grace' },
        { tab: 'all', drill: null },
      ),
    ).toBe(false);
  });
});

/**
 * Whether the search field takes focus is an opening *condition*, not part of where the
 * panel is — so two openings of the same place must still count as the same place. Without
 * that, `openLibraryPanel` would treat a chord-open and a chip-open of Everything as a move
 * and push a second history entry for a panel that never went anywhere.
 */
describe('autoFocusSearch', () => {
  it('does not make two openings of the same place look different', () => {
    expect(
      isSameLibraryPanelView(
        { tab: 'all', drill: null, autoFocusSearch: true },
        { tab: 'all', drill: null },
      ),
    ).toBe(true);
  });

  it('still distinguishes places, whatever focus was asked for', () => {
    expect(
      isSameLibraryPanelView(
        { tab: 'all', drill: null, autoFocusSearch: true },
        { tab: 'notes', drill: null, autoFocusSearch: true },
      ),
    ).toBe(false);
  });
});

/**
 * The opener asks for the caret; the device decides whether it gets it. Both refusals are
 * kept because they catch different machines — see `shouldAutoFocusLibrarySearch`.
 */
describe('shouldAutoFocusLibrarySearch', () => {
  const asked = { autoFocusSearch: true };

  it('gives the caret to a mouse at desktop width', () => {
    expect(
      shouldAutoFocusLibrarySearch({ view: asked, isMobileSidebar: false, isCoarsePointer: false }),
    ).toBe(true);
  });

  it('refuses on a phone', () => {
    // A bottom sheet with the keyboard up over it shows less of the library than no sheet.
    expect(
      shouldAutoFocusLibrarySearch({ view: asked, isMobileSidebar: true, isCoarsePointer: true }),
    ).toBe(false);
  });

  it('refuses a finger on a tablet laid out as a desktop', () => {
    // The case the breakpoint alone gets wrong: wide enough to look like a desktop, with no
    // keyboard but the one that slides up.
    expect(
      shouldAutoFocusLibrarySearch({ view: asked, isMobileSidebar: false, isCoarsePointer: true }),
    ).toBe(false);
  });

  it('refuses a mouse in a narrow window', () => {
    // And the case the pointer alone gets wrong, which is why neither check is dropped.
    expect(
      shouldAutoFocusLibrarySearch({ view: asked, isMobileSidebar: true, isCoarsePointer: false }),
    ).toBe(false);
  });

  it('takes nothing that was not asked for', () => {
    // A drill names a destination, not a query.
    expect(
      shouldAutoFocusLibrarySearch({ view: {}, isMobileSidebar: false, isCoarsePointer: false }),
    ).toBe(false);
  });
});
