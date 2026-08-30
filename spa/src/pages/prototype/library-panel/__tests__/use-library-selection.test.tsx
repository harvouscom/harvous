/**
 * What the panel's selection will and will not point a verb at.
 *
 * Two rules here are decisions rather than mechanics, and both are the kind a later refactor
 * would quietly reverse: selection is offered on one tab only, and a selection containing a
 * row this surface has not loaded produces no context at all. The second is the important
 * one — a row past the page boundary has no capability input, and inventing one is how a
 * batch half-applies. The sidebar's builder refuses for the same reason.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
const shell = {
  sidebarSelectMode: true,
  setSidebarSelectMode: vi.fn(),
  sidebarSelectedIds: [] as string[],
  sidebarSelectionKind: 'note' as string,
  setSidebarSelection: vi.fn(),
};

vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => shell,
}));
vi.mock('../../../../lib/prototype-organize-runner-store', () => ({
  useOrganizeApi: () => ({
    run: vi.fn(),
    canCreateCollections: true,
    openCreateFolder: vi.fn(),
    openCreateThread: vi.fn(),
  }),
}));
vi.mock('../../../../lib/prototype-command-context-store', () => ({
  publishPrototypeCommandContext: () => () => {},
}));

const { useLibrarySelection, librarySelectionKindForTab, packMixedId, unpackMixedId } =
  await import('../use-library-selection');

function note(id: string) {
  return { id, isOwnNote: true };
}

function selection(tab: string, rows: Array<{ id: string; isOwnNote: boolean }>) {
  return renderHook(() =>
    useLibrarySelection({
      tab: tab as never,
      rows,
      isScopedSharedSpace: false,
      viewerIsSpaceOwner: true,
    }),
  ).result.current;
}

beforeEach(() => {
  shell.sidebarSelectedIds = [];
  shell.sidebarSelectionKind = 'note';
  shell.sidebarSelectMode = true;
  vi.clearAllMocks();
});

describe('which tabs can be selected in', () => {
  it('maps each list tab to what a selection there is made of', () => {
    expect(librarySelectionKindForTab('notes' as never)).toBe('note');
    expect(librarySelectionKindForTab('folders' as never)).toBe('folder');
    expect(librarySelectionKindForTab('threads' as never)).toBe('thread');
    expect(librarySelectionKindForTab('highlights' as never)).toBe('highlight');
  });

  it('is Everything too, where the kind is whatever you happen to pick', () => {
    /*
     * This used to be null, on the reasoning that a checkbox would appear on some rows and
     * not others. That is still true of Scripture and resource rows, which have no bulk verbs
     * to offer — but it turned out to be an argument for marking those rows, not for refusing
     * selection on the tab people land on first. `'mixed'` is a real selection kind: its ids
     * are composite, so one selection can hold a note and a folder and the verbs offered are
     * the ones that work on both.
     */
    expect(librarySelectionKindForTab('all' as never)).toBe('mixed');
  });

  it('is not Scripture, whose rows are cards rather than list rows', () => {
    expect(librarySelectionKindForTab('scripture' as never)).toBeNull();
  });
});

describe('what a verb is pointed at', () => {
  it('is the selection when every selected row is loaded', () => {
    shell.sidebarSelectedIds = ['a', 'b'];
    const ctx = selection('notes', [note('a'), note('b'), note('c')]).context;
    expect(ctx?.ids).toEqual(['a', 'b']);
    expect(ctx?.rows).toHaveLength(2);
    expect(ctx?.fromSelection).toBe(true);
  });

  it('is nothing when a selected row is past the loaded page', () => {
    // 'z' was selected before more pages loaded, or in another list. Guessing a capability
    // input for it is how half a batch applies.
    shell.sidebarSelectedIds = ['a', 'z'];
    expect(selection('notes', [note('a')]).context).toBeNull();
  });

  it('is nothing with an empty selection', () => {
    expect(selection('notes', [note('a')]).context).toBeNull();
  });

  it('is nothing on a tab that cannot be selected in', () => {
    shell.sidebarSelectedIds = ['a'];
    expect(selection('all', [note('a')]).context).toBeNull();
  });

  it('carries the tab own kind, so the bar offers that kind own verbs', () => {
    shell.sidebarSelectedIds = ['Sermons'];
    shell.sidebarSelectionKind = 'folder';
    expect(selection('folders', [{ id: 'Sermons', isOwnNote: true }]).context?.kind).toBe('folder');
  });
});

describe('select all', () => {
  it('knows when everything on the tab is already chosen', () => {
    shell.sidebarSelectedIds = ['a', 'b'];
    expect(selection('notes', [note('a'), note('b')]).allSelected).toBe(true);
  });

  it('is false while one row is still out', () => {
    shell.sidebarSelectedIds = ['a'];
    expect(selection('notes', [note('a'), note('b')]).allSelected).toBe(false);
  });
});

describe('composite ids, which is what lets one selection hold several kinds', () => {
  it('round-trips a kind and its source id', () => {
    expect(unpackMixedId(packMixedId('folder', 'Assurance'))).toEqual({
      kind: 'folder',
      sourceId: 'Assurance',
    });
  });

  it('keeps a note and a folder of the same name apart', () => {
    /* The exact collision the prefix exists for: a folder is keyed by its name, and a note id
       could be anything — including that name. */
    expect(packMixedId('note', 'Assurance')).not.toBe(packMixedId('folder', 'Assurance'));
  });

  it('survives a source id containing a colon', () => {
    /* Split on the *first* colon only: thread drill slugs and scripture keys carry their own. */
    expect(unpackMixedId('thread:cluster:abc:1')).toEqual({
      kind: 'thread',
      sourceId: 'cluster:abc:1',
    });
  });

  it('refuses anything that is not a packed id', () => {
    /* A bare id reaching the unpacker means a row and the selection have got out of step, and
       the context is withheld rather than acting on the half that parsed. */
    expect(unpackMixedId('note_123')).toBeNull();
    expect(unpackMixedId(':orphan')).toBeNull();
    expect(unpackMixedId('resource:r1')).toBeNull();
  });
});
