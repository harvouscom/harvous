/**
 * A folder on Everything.
 *
 * It rendered, took hover and a checkbox, and did nothing when pressed: `activate` had a case
 * for every kind the tab lists except folders. The Folders tab opened the same folder fine, so
 * the gap only showed on the tab that mixes everything together — which is the tab the panel
 * opens on.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SpaceNoteRow } from '../../../../hooks/queries/useSpace';

const setLibraryPanelView = vi.fn();

const notes = [
  {
    id: 'n1',
    title: 'Grace abounds',
    content: '<p>Nothing in particular.</p>',
    updatedAt: '2026-08-01T00:00:00.000Z',
    primaryCollection: 'Sermons',
    secondaryCollections: [],
  },
] as unknown as SpaceNoteRow[];

vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ setLibraryPanelView }),
}));

vi.mock('../library-panel-data', () => ({
  useLibraryPanelData: () => ({
    spaceId: 'space_home',
    isScopedSharedSpace: false,
    shellIsSharedSpace: false,
    viewingHome: false,
    homeSpaceId: 'space_home',
    setListScope: vi.fn(),
    notes,
    notesById: new Map(notes.map((n) => [n.id, n])),
    notesPhase: 'list',
    hasMoreNotes: false,
    isFetchingMoreNotes: false,
    fetchMoreNotes: vi.fn(),
    activeNoteFullId: undefined,
    openNote: vi.fn(),
    openHighlight: vi.fn(),
    openResource: vi.fn(),
  }),
}));

vi.mock('../../../../hooks/mutations/usePrototypeFolderRegistry', () => ({
  usePrototypeFolderRegistry: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/queries/usePrototypeSpaceScriptureIndex', () => ({
  usePrototypeSpaceScriptureIndex: () => ({ data: [] }),
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
  useLibrary: () => ({ data: { items: [] } }),
}));

const { default: PrototypeLibraryAllView } = await import('../PrototypeLibraryAllView');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a folder row on Everything', () => {
  it('opens that folder, staying on Everything so Back returns there', () => {
    // The drill carries the tab it was opened from. Jumping to the Folders tab instead would
    // send Back somewhere the reader never visited — the rule every other drill here follows.
    render(<PrototypeLibraryAllView />);
    // A tile row now (the same row search draws), not a card: its name is the title and count.
    screen.getByRole('button', { name: /^Sermons\b.*1 note/ }).click();

    expect(setLibraryPanelView).toHaveBeenCalledWith({
      tab: 'all',
      drill: { kind: 'folder', folderKey: 'Sermons' },
    });
  });
});

describe('Everything wears the tile rows', () => {
  it('draws folders and notes as the same row search does, with the count as meta', () => {
    const { container } = render(<PrototypeLibraryAllView />);
    expect(container.querySelector('.proto-library-tile-rows')).toBeTruthy();
    const folder = container.querySelector('li[data-kind="folder"]');
    expect(folder?.querySelector('.proto-search-row__meta')?.textContent).toBe('1 note');
    expect(container.querySelector('li[data-kind="note"] .proto-note-row__lead-icon')).toBeTruthy();
    /* No cards left in the list. */
    expect(container.querySelector('.proto-collection-grid-item')).toBeNull();
  });
});
