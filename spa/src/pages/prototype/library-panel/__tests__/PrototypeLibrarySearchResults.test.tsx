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
} = { notes: [], scriptureBooks: [], resources: [], ctx: null };

const setLibraryPanelView = vi.fn();
const closeLibraryPanel = vi.fn();
const run = vi.fn();

vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ setLibraryPanelView, closeLibraryPanel }),
}));

vi.mock('../use-library-command-context', () => ({
  useLibraryCommandContext: () => ({ ctx: state.ctx, run }),
}));

vi.mock('../library-panel-data', () => ({
  useLibraryPanelData: () => ({
    spaceId: 'space-1',
    isScopedSharedSpace: false,
    notes: state.notes,
    notesById: new Map(state.notes.map((n) => [n.id, n])),
    activeNoteFullId: undefined,
    openNote: vi.fn(),
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
  vi.clearAllMocks();
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
