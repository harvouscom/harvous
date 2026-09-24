/**
 * What the Library panel shows once you type.
 *
 * Four things here are decisions rather than behaviour that falls out of the code, and
 * each of them is a thing a later refactor could quietly reverse without breaking
 * anything else:
 *
 *  - the tab is the type filter, so a folder hit has no business on the Notes tab;
 *  - the passage a query *names* outlives a tab that has nothing else in it, which is the
 *    exact case the row was added for and the exact case an empty state would eat;
 *  - Actions win the top of the surface over the passage hoist, which claims the same
 *    place in `sidebar-universal-search`;
 *  - and the groups run Actions → Go to → hoist → results.
 *
 * The last one cannot be asserted in a single render, and that is itself the tiebreak:
 * Actions need a query that fuzzy-matches a verb and the hoist needs one that resolves to
 * a passage, and no string is plausibly both. So the order is pinned in two halves — the
 * group order around Actions, and the hoist's place at the head of the result rows.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SpaceNoteRow } from '../../../../hooks/queries/useSpace';
import type { CommandContext } from '../../../../lib/prototype-commands';
import { SIDEBAR_NO_MATCH_COPY } from '../../sidebar-no-match-copy';

/**
 * A context with a standing selection — which is what actually reaches the panel, since
 * the sidebar's selection is shell state and survives the panel opening over it.
 */
const CTX: CommandContext = {
  kind: 'note',
  kinds: ['note'],
  items: [
    { kind: 'note', id: 'n1' },
    { kind: 'note', id: 'n2' },
  ],
  ids: ['n1', 'n2'],
  rows: [
    { isOwnNote: true, isScopedSharedSpace: false, viewerIsSpaceOwner: true },
    { isOwnNote: true, isScopedSharedSpace: false, viewerIsSpaceOwner: true },
  ],
  fromSelection: true,
  isScopedSharedSpace: false,
};

function note(id: string, title: string, folder?: string): SpaceNoteRow {
  return {
    id,
    title,
    content: '<p>Nothing in particular.</p>',
    updatedAt: '2026-08-01T00:00:00.000Z',
    primaryCollection: folder ?? null,
    secondaryCollections: [],
  } as unknown as SpaceNoteRow;
}

/** Everything the mocked hooks hand back, reset per test. */
const state: {
  notes: SpaceNoteRow[];
  scriptureBooks: unknown[];
  resources: unknown[];
  ctx: CommandContext | null;
  isScopedSharedSpace: boolean;
  /** The space the panel is showing. */
  spaceId: string;
  /** What the unscoped (My Home) note search returns. */
  homeHits: unknown[];
  /** Every scope the component searched with, in order. */
  searchScopes: unknown[];
  /** What the whole-Bible verse search returns. */
  verseHits: unknown[];
  verseHasMore: boolean;
  /** Every (query, translation) the verse search was asked for. */
  verseQueries: [string, string][];
} = {
  notes: [],
  scriptureBooks: [],
  resources: [],
  ctx: null,
  isScopedSharedSpace: false,
  spaceId: 'space-1',
  homeHits: [],
  searchScopes: [],
  verseHits: [],
  verseHasMore: false,
  verseQueries: [],
};

const setLibraryPanelView = vi.fn();
const closeLibraryPanel = vi.fn();
const run = vi.fn();
const openHomeNote = vi.fn();

/* Answers by scope, the way the endpoint does: the space-scoped search finds nothing here,
   and only a query the component actually enabled (non-empty) gets the Home hits. */
vi.mock('@/hooks/useSearch', () => ({
  useSearch: (query: string, scope?: { spaceId?: string }) => {
    state.searchScopes.push(scope);
    return {
      data: query && !scope?.spaceId ? { results: state.homeHits } : undefined,
      isLoading: false,
    };
  },
}));

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));

vi.mock('../../../../hooks/queries/useProfile', () => ({
  useProfile: () => ({ data: { defaultTranslation: 'ESV' } }),
}));

vi.mock('../../../../hooks/queries/useScriptureVerseSearch', () => ({
  useScriptureVerseSearch: (query: string, translation: string) => {
    state.verseQueries.push([query, translation]);
    return {
      data: query ? { results: state.verseHits, hasMore: state.verseHasMore } : undefined,
      isLoading: false,
      isPlaceholderData: false,
    };
  },
}));

vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ setLibraryPanelView, closeLibraryPanel }),
}));

vi.mock('../use-library-command-context', () => ({
  useLibraryCommandContext: () => ({ ctx: state.ctx, run }),
}));

vi.mock('../library-panel-data', () => ({
  useLibraryPanelData: () => ({
    spaceId: state.spaceId,
    isScopedSharedSpace: state.isScopedSharedSpace,
    homeSpaceId: 'space_home',
    notes: state.notes,
    notesById: new Map(state.notes.map((n) => [n.id, n])),
    activeNoteFullId: undefined,
    openNote: vi.fn(),
    openHomeNote,
    openHighlight: vi.fn(),
    openResource: vi.fn(),
    resolveDrillNoteRow: (brief: { id: string }) => brief,
  }),
}));

vi.mock('../../../../hooks/mutations/usePrototypeFolderRegistry', () => ({
  usePrototypeFolderRegistry: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/queries/usePrototypeSpaceScriptureIndex', () => ({
  usePrototypeSpaceScriptureIndex: () => ({ data: state.scriptureBooks }),
}));
vi.mock('../../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights', () => ({
  usePrototypeSpaceStudyThreadHighlights: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/queries/usePrototypeStudyThreads', () => ({
  usePrototypeStudyThreads: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/queries/useSpaceGroupThreads', () => ({
  useSpaceGroupThreads: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/queries/useLibrary', () => ({
  useLibrary: () => ({ data: { items: state.resources } }),
}));

const { default: PrototypeLibrarySearchResults } = await import('../PrototypeLibrarySearchResults');
type Props = Parameters<typeof PrototypeLibrarySearchResults>[0];

function renderResults(props: Props) {
  return render(<PrototypeLibrarySearchResults {...props} />);
}

/** The group headings, in the order they are painted. */
function headings(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.proto-library-results__heading')].map(
    (el) => el.textContent ?? '',
  );
}

beforeEach(() => {
  state.notes = [];
  state.scriptureBooks = [];
  state.resources = [];
  state.ctx = null;
  state.isScopedSharedSpace = false;
  state.spaceId = 'space-1';
  state.homeHits = [];
  state.searchScopes = [];
  state.verseHits = [];
  state.verseHasMore = false;
  state.verseQueries = [];
  vi.clearAllMocks();
});

describe('In the Bible', () => {
  const S = '\u0002';
  const E = '\u0003';
  function verse(book: string, chapter: number, n: number, snippet: string) {
    return { book, chapter, verse: n, reference: `${book} ${chapter}:${n}`, snippet, translation: 'ESV' };
  }

  it('searches the whole Bible in the reader’s own translation', () => {
    renderResults({ query: 'love your enemies', tab: 'all' });
    expect(state.verseQueries.at(-1)).toEqual(['love your enemies', 'ESV']);
  });

  it('does not ask on a tab a verse does not belong under', () => {
    renderResults({ query: 'love your enemies', tab: 'notes' });
    expect(state.verseQueries.at(-1)).toEqual(['', 'ESV']);
  });

  it('marks the matched words, and opens the reader at the verse', () => {
    state.verseHits = [verse('Matthew', 5, 44, `But I say to you, ${S}Love${E} your ${S}enemies${E}`)];
    const { container } = renderResults({ query: 'love your enemies', tab: 'all' });

    expect(headings(container)).toContain('In the Bible · ESV');
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Love', 'enemies']);

    screen.getByText('Matthew 5:44').click();
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { book: 'matthew', chapter: '5' },
        search: expect.objectContaining({ v: '44', t: 'ESV' }),
      }),
    );
    expect(closeLibraryPanel).toHaveBeenCalledWith({ preserveHistory: true });
  });

  it('shows a few under Everything and hands the rest to the Scripture tab', () => {
    state.verseHits = Array.from({ length: 8 }, (_, i) => verse('Psalms', 23, i + 1, `${S}shepherd${E}`));
    const { container } = renderResults({ query: 'shepherd', tab: 'all' });

    expect(container.querySelectorAll('.proto-verse-hit__text')).toHaveLength(5);
    screen.getByText('Show more verses').click();
    expect(setLibraryPanelView).toHaveBeenCalledWith({ tab: 'scripture', drill: null });
  });

  it('does not paint "no matches" above verses that did match', () => {
    state.verseHits = [verse('John', 11, 35, `${S}Jesus${E} wept.`)];
    renderResults({ query: 'jesus wept', tab: 'scripture' });
    expect(screen.queryByText(SIDEBAR_NO_MATCH_COPY.noScriptureMatch)).toBeNull();
  });
});

describe('My Home, searched from inside a shared space', () => {
  function hit(id: string, title: string, spaceId: string | null) {
    return {
      id,
      type: 'note',
      title,
      content: '<p>Grace upon grace.</p>',
      spaceId,
      lastUpdated: '2026-08-01T00:00:00.000Z',
    };
  }

  beforeEach(() => {
    state.isScopedSharedSpace = true;
  });

  it('finds a note that lives in My Home, and opens it as a Home note', () => {
    // The bug: from a shared space the panel only searched that space, so the notes you
    // wrote at home could not be found at all.
    state.homeHits = [hit('h1', 'Grace at home', 'space_home')];
    renderResults({ query: 'grace', tab: 'all' });

    const home = screen
      .getByRole('heading', { name: 'My Home' })
      .closest('.proto-library-results__group');
    expect(home?.textContent).toContain('Grace at home');

    screen.getByText('Grace at home').click();
    expect(openHomeNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1' }));
  });

  it('matches the Home id with or without its space_ prefix', () => {
    state.homeHits = [hit('h1', 'Grace at home', 'home')];
    renderResults({ query: 'grace', tab: 'all' });
    expect(screen.getByRole('heading', { name: 'My Home' })).toBeTruthy();
  });

  it('keeps out notes the viewer wrote into other spaces', () => {
    // The unscoped search returns everything the viewer authored. A note written into some
    // other shared space is not a Home note, and calling it one would open it in the wrong place.
    state.homeHits = [hit('s1', 'Grace in the group', 'space_other'), hit('n0', 'Grace loose', null)];
    renderResults({ query: 'grace', tab: 'all' });
    expect(screen.queryByRole('heading', { name: 'My Home' })).toBeNull();
  });

  it('does not repeat a note this space already shows', () => {
    state.notes = [note('n1', 'Grace abounds')];
    state.homeHits = [hit('n1', 'Grace abounds', 'space_home')];
    const { container } = renderResults({ query: 'grace', tab: 'all' });

    expect(screen.queryByRole('heading', { name: 'My Home' })).toBeNull();
    expect(container.querySelectorAll('.proto-note-list li')).toHaveLength(1);
  });

  it('is shown under a kind tab too — it is a scope, not a kind', () => {
    state.homeHits = [hit('h1', 'Grace at home', 'space_home')];
    renderResults({ query: 'grace', tab: 'folders' });
    expect(screen.getByRole('heading', { name: 'My Home' })).toBeTruthy();
  });

  it('is absent in My Home itself, where the search already is Home', () => {
    state.isScopedSharedSpace = false;
    state.homeHits = [hit('h1', 'Grace at home', 'space_home')];
    renderResults({ query: 'grace', tab: 'all' });
    expect(screen.queryByRole('heading', { name: 'My Home' })).toBeNull();
  });

  it('stands down while the panel’s switch is on My Home, where the search itself is Home', () => {
    // The panel reports Home as its space there, so the main search is scoped to it and a
    // second "My Home" group would only repeat it.
    state.isScopedSharedSpace = false;
    state.spaceId = 'space_home';
    state.homeHits = [hit('h1', 'Grace at home', 'space_home')];
    renderResults({ query: 'grace', tab: 'all' });

    expect(screen.queryByRole('heading', { name: 'My Home' })).toBeNull();
    expect(state.searchScopes).toContainEqual(expect.objectContaining({ spaceId: 'space_home' }));
  });
});

describe('the tab is the type filter', () => {
  beforeEach(() => {
    // One note, filed in "Sermons". The folder matches the query by name; the note itself
    // does not — folders are not part of a note's searchable text.
    state.notes = [note('n1', 'Grace abounds', 'Sermons')];
  });

  it('shows a folder hit on All', () => {
    renderResults({ query: 'Sermons', tab: 'all' });
    expect(screen.getByText('Sermons')).toBeTruthy();
  });

  it('keeps that folder hit out of Notes, and offers it below instead', () => {
    /*
     * The kind is a filter on the *named* group, not on the answer. A picker that says
     * Notes must not deliver a folder among the notes — but hiding the folder outright
     * meant searching inside a kind silently withheld the rest of what matched, and the
     * only way to see it was to notice something was missing and go change the picker.
     * So: the kind's own group, then everywhere else beneath it.
     */
    renderResults({ query: 'Sermons', tab: 'notes' });

    const notesGroup = screen
      .getByRole('heading', { name: 'Notes' })
      .closest('.proto-library-results__group');
    expect(notesGroup?.textContent).not.toContain('Sermons');
    expect(screen.getByText(SIDEBAR_NO_MATCH_COPY.noNotesMatch)).toBeTruthy();

    const elsewhere = screen
      .getByRole('heading', { name: 'Everywhere else' })
      .closest('.proto-library-results__group');
    expect(elsewhere?.textContent).toContain('Sermons');
  });

  it('shows no everywhere-else group on All, where there is no else', () => {
    renderResults({ query: 'Sermons', tab: 'all' });
    expect(screen.queryByRole('heading', { name: 'Everywhere else' })).toBeNull();
  });
});

describe('the passage the query names', () => {
  it('survives a tab with nothing else in it', () => {
    // Nothing is indexed, so the tab has no matches of its own. Painting "no references
    // found" over the passage row would defeat the one row that exists precisely for the
    // chapter nobody has written about yet.
    renderResults({ query: '1 cor 13', tab: 'scripture' });

    expect(screen.getByText('1 Corinthians 13')).toBeTruthy();
    expect(screen.getByText('Read passage')).toBeTruthy();
    expect(screen.queryByText(SIDEBAR_NO_MATCH_COPY.noScriptureMatch)).toBeNull();
  });

  it('stays away from a tab it does not belong to', () => {
    renderResults({ query: '1 cor 13', tab: 'notes' });
    expect(screen.queryByText('Read passage')).toBeNull();
  });

  it('leads the result rows', () => {
    // The hoist is a destination, not a match, so it goes above the things that merely
    // mention it. The folder here is a guaranteed second row to be above.
    state.notes = [note('n1', 'Grace abounds', '1 cor 13 study')];
    const { container } = renderResults({ query: '1 cor 13', tab: 'all' });

    const rows = [...container.querySelectorAll('.proto-note-list li')];
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]?.textContent).toContain('Read passage');
    expect(container.textContent).toContain('1 cor 13 study');
  });
});

describe('Actions', () => {
  beforeEach(() => {
    state.ctx = CTX;
  });

  it('sit above results — the tiebreak the header documents', () => {
    state.notes = [note('n1', 'Delete me later')];
    const { container } = renderResults({ query: 'delete', tab: 'all' });

    expect(headings(container)[0]).toBe('Actions');
    expect(headings(container)).toContain('Results');
    expect(screen.getByText(/^Delete 2 notes$/)).toBeTruthy();
  });

  it('print the chord that would have done the same thing', () => {
    // The chords get taught by being shown next to the verb you reached for the field to
    // find — that was the palette's whole reason for existing, and it moved here.
    const { container } = renderResults({ query: 'delete', tab: 'all' });
    expect(container.querySelector('.proto-kbd-chord')).toBeTruthy();
  });

  it('run the command and close the panel', () => {
    renderResults({ query: 'delete', tab: 'all' });
    screen.getByText(/^Delete 2 notes$/).click();
    expect(run).toHaveBeenCalledWith('organize.delete');
    expect(closeLibraryPanel).toHaveBeenCalled();
  });

  it('are absent without a context to act on', () => {
    state.ctx = null;
    const { container } = renderResults({ query: 'delete', tab: 'all' });
    expect(headings(container)).not.toContain('Actions');
  });

  it('come before Go to, which comes before results', () => {
    const { container } = renderResults({
      query: 'delete',
      tab: 'all',
      navigationItems: [
        { id: 'trash', label: 'Deleted notes', icon: 'trash-can', keys: '⇧X', run: vi.fn() },
      ],
    });
    expect(headings(container)).toEqual(['Actions', 'Go to', 'Results']);
  });
});

describe('Go to', () => {
  it('offers only the destinations the query names', () => {
    const { container } = renderResults({
      query: 'settings',
      tab: 'all',
      navigationItems: [
        { id: 'settings', label: 'Settings', icon: 'gear', keys: '⇧,', run: vi.fn() },
        { id: 'reader', label: 'Read the Bible', icon: 'scroll', keys: '⇧R', run: vi.fn() },
      ],
    });
    expect(headings(container)).toContain('Go to');
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.queryByText('Read the Bible')).toBeNull();
  });

  it('is left out entirely when no destination matches', () => {
    const { container } = renderResults({
      query: 'zzzznowhere',
      tab: 'all',
      navigationItems: [
        { id: 'settings', label: 'Settings', icon: 'gear', keys: '⇧,', run: vi.fn() },
      ],
    });
    expect(headings(container)).not.toContain('Go to');
  });
});
