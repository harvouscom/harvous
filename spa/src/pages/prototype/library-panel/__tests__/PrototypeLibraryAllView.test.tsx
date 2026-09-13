/**
 * A folder card on Everything.
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

describe('a folder card on Everything', () => {
  it('opens that folder, staying on Everything so Back returns there', () => {
    // The drill carries the tab it was opened from. Jumping to the Folders tab instead would
    // send Back somewhere the reader never visited — the rule every other drill here follows.
    render(<PrototypeLibraryAllView />);
    screen.getByRole('button', { name: /^Sermons,/ }).click();

    expect(setLibraryPanelView).toHaveBeenCalledWith({
      tab: 'all',
      drill: { kind: 'folder', folderKey: 'Sermons' },
    });
  });
});
