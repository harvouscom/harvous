/**
 * Settings → Sharing: one ⋮ per row, every action from its menu, and confirms that never take
 * the row over.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(() => Promise.resolve()) }),
}));
const toastSuccess = vi.fn();
vi.mock('@/utils/toast', () => ({ toast: { error: vi.fn(), success: toastSuccess } }));
vi.mock('@/utils/sounds', () => ({ playSound: vi.fn(), warmSounds: vi.fn() }));

const shareMutate = vi.fn(() => Promise.resolve());
vi.mock('../../../../hooks/mutations/useShareNote', () => ({
  useShareNote: () => ({ mutateAsync: shareMutate }),
}));

let links: unknown[] = [];
let owned: unknown[] = [];
let memberOf: unknown[] = [];
let deleted: unknown[] = [];
const query = (data: unknown) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() });
vi.mock('../../../../hooks/queries/useMySharing', () => ({
  mySharingQueryKey: ['my-sharing'],
  useMySharing: () => query({ notes: links }),
}));
vi.mock('../../../../hooks/queries/useMySharedSpaces', () => ({
  useMySharedSpaces: () => query({ owned, memberOf }),
}));
vi.mock('../../../../hooks/queries/useMySharedSpaceNotes', () => ({
  mySharedSpaceNotesQueryKey: ['my-shared-space-notes'],
  useMySharedSpaceNotes: () => query({ notes: [] }),
}));
vi.mock('../../../../hooks/queries/useDiscoverListings', () => ({
  useMyDiscoverSubmissions: () => query({ listings: [] }),
}));
vi.mock('../../../../hooks/queries/useDeletedSpaces', () => ({
  useDeletedSpaces: () => query({ spaces: deleted }),
}));
const idle = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined };
vi.mock('../../../../hooks/mutations/useDiscoverMutations', () => ({ useWithdrawDiscoverSubmission: () => idle }));
vi.mock('../../../../hooks/mutations/useSpaceNoteAssociation', () => ({
  normalizeAssociationSpaceId: (id: string) => id,
  useRemoveNoteFromSpace: () => idle,
}));
vi.mock('../../../../hooks/mutations/useLeaveSpace', () => ({ useLeaveSpace: () => idle }));
vi.mock('../../../../hooks/mutations/useRestoreSpace', () => ({ useRestoreSpace: () => idle }));
vi.mock('../../../../hooks/useSwitchToSpace', () => ({ useSwitchToSpace: () => vi.fn() }));
vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ activeSpaceId: null, setActiveSpaceId: vi.fn() }),
}));

if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const PrototypeSharingPage = (await import('../PrototypeSharingPage')).default;

function link(id: string) {
  return {
    id,
    title: `Link ${id}`,
    shareToken: 'tok',
    shareUrl: `https://harvous.com/shared/note/${id}`,
    sharedAt: '2026-10-01T00:00:00Z',
  };
}

beforeEach(() => {
  links = [];
  owned = [];
  memberOf = [];
  deleted = [];
  navigate.mockClear();
  shareMutate.mockClear();
  toastSuccess.mockClear();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});

describe('Settings → Sharing', () => {
  it('gives each row exactly one control: its ⋮', () => {
    links = [link('n1'), link('n2')];
    render(<PrototypeSharingPage />);
    expect(screen.getAllByRole('button', { name: /^More for/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
    expect(screen.queryByText('Stop sharing')).toBeNull();
  });

  it('opens the note when the row itself is tapped', () => {
    links = [link('n1')];
    render(<PrototypeSharingPage />);
    fireEvent.click(screen.getByText('Link n1'));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('copies the link from the menu', async () => {
    links = [link('n1')];
    render(<PrototypeSharingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'More for Link n1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    await vi.waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Link copied'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://harvous.com/shared/note/n1');
  });

  it('asks before replacing a link, in a dialog rather than in the row', () => {
    links = [link('n1')];
    render(<PrototypeSharingPage />);
    fireEvent.click(screen.getByRole('button', { name: 'More for Link n1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New link' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Replace this link?')).toBeTruthy();
    expect(shareMutate).not.toHaveBeenCalled();
  });

  it('leaves out the kind filter when there is only one kind to show', () => {
    links = [link('n1'), link('n2')];
    render(<PrototypeSharingPage />);
    expect(screen.queryByText('Public links')).toBeNull();
  });

  it('shows the filter once there is something to narrow between', () => {
    links = [link('n1')];
    owned = [{ id: 's1', title: 'Family', memberCount: 3, createdAt: '2026-09-01T00:00:00Z' }];
    render(<PrototypeSharingPage />);
    expect(screen.getByText('Public links')).toBeTruthy();
  });

  it('folds recently deleted spaces into one line that opens in place', () => {
    links = [link('n1')];
    deleted = [
      { id: 'd1', title: 'Old group', color: 'paper', recoveryUntil: '2099-01-01T00:00:00Z' },
    ];
    render(<PrototypeSharingPage />);
    const toggle = screen.getByRole('button', { name: /Recently deleted spaces/ });
    expect(screen.queryByText('Old group')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Old group')).toBeTruthy();
  });
});
