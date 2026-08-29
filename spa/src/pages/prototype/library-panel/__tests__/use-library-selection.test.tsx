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
import type { SpaceNoteRow } from '../../../../hooks/queries/useSpace';

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
  useOrganizeApi: () => ({ run: vi.fn(), openCreateFolder: vi.fn(), openCreateThread: vi.fn() }),
}));
vi.mock('../../../../lib/prototype-command-context-store', () => ({
  publishPrototypeCommandContext: () => () => {},
}));

const { useLibrarySelection, librarySelectionKindForTab } = await import('../use-library-selection');

function note(id: string): SpaceNoteRow {
  return { id, title: id, isOwnNote: true } as unknown as SpaceNoteRow;
}

function selection(tab: string, rows: SpaceNoteRow[]) {
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
  it('is Notes, and only Notes', () => {
    expect(librarySelectionKindForTab('notes' as never)).toBe('note');
  });

  it('is not Everything, where a checkbox would appear on some rows and not others', () => {
    expect(librarySelectionKindForTab('all' as never)).toBeNull();
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
