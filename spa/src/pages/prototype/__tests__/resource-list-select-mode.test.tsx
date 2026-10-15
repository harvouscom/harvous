/**
 * The resource list in the expanded tool's select mode.
 *
 * The same component serves the Library panel, where a click leaves for the resource, and
 * the expanded Resources tool, where a click shows it in the viewer. The failure worth
 * catching is a row kind still leaving the app in select mode — church and room rows used
 * to open themselves inline, without going through the list's opener at all.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const openLibraryFileItem = vi.fn();

const personal = {
  id: 'lib_1',
  libraryId: 'library_1',
  kind: 'link',
  title: 'What is the gospel?',
  description: null,
  sourceUrl: 'https://bibleproject.com/articles/gospel/',
  sourceDomain: 'bibleproject.com',
  sourceSiteName: 'BibleProject',
  sourceImage: null,
  fileName: null,
  fileMime: null,
  fileBytes: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: null,
};

const churchFile = {
  id: 'church_1',
  kind: 'file',
  title: 'Romans study guide',
  description: null,
  sourceUrl: null,
  sourceDomain: null,
  sourceSiteName: null,
  sourceImage: null,
  fileName: 'romans.pdf',
  fileMime: 'application/pdf',
  fileBytes: 1000,
  access: 'members',
  scopes: [],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: null,
};

vi.mock('../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({
    sidebarSelectMode: false,
    sidebarSelectionKind: null,
    sidebarSelectedIds: [],
    setSidebarSelection: vi.fn(),
  }),
}));

vi.mock('../../../hooks/queries/useLibrary', () => ({
  useLibrary: () => ({
    data: { library: { id: 'library_1' }, items: [personal] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useLibraryLinkPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateLibraryItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadLibraryItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveLibraryItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  openLibraryFileItem: (...args: unknown[]) => openLibraryFileItem(...args),
}));

vi.mock('../../../hooks/queries/useChurchLibrary', () => ({
  useChurchLibraryUnion: () => ({
    data: { church: { name: 'Grace Church' }, items: [churchFile] },
    isLoading: false,
    isError: false,
  }),
  useSuggestLibraryItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/queries/useSpaceLibrary', () => ({
  useSpaceLibrary: () => ({ data: undefined, isPending: false, isError: false }),
  useSpaceLibraryActions: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/queries/useNavigation', () => ({
  useNavigation: () => ({ data: undefined }),
}));

vi.mock('../../../hooks/mutations/useDiscoverMutations', () => ({
  useSubmitToDiscover: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

/* The sheets are closed throughout and bring their own hooks; nothing here is about them. */
vi.mock('../PrototypeSuggestResourceSheet', () => ({ default: () => null }));
vi.mock('../PrototypeShareWithOthersSheet', () => ({ default: () => null }));

const { default: PrototypeResourceLibraryList } = await import('../PrototypeResourceLibraryList');

function renderList(props: Partial<Parameters<typeof PrototypeResourceLibraryList>[0]> = {}) {
  const onOpenResource = vi.fn();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <PrototypeResourceLibraryList query="" onOpenResource={onOpenResource} {...props} />
    </QueryClientProvider>,
  );
  return { onOpenResource };
}

describe('resource list select mode', () => {
  let windowOpen: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    openLibraryFileItem.mockReset();
    windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('selects a personal row instead of opening it', () => {
    const onSelectResource = vi.fn();
    const { onOpenResource } = renderList({ onSelectResource });
    fireEvent.click(screen.getByRole('button', { name: 'Resource: What is the gospel?' }));
    expect(onSelectResource).toHaveBeenCalledWith({ source: 'mine', id: 'lib_1' });
    expect(onOpenResource).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('selects a church row instead of minting a file URL', () => {
    const onSelectResource = vi.fn();
    renderList({ onSelectResource });
    fireEvent.click(screen.getByRole('button', { name: 'Church resource: Romans study guide' }));
    expect(onSelectResource).toHaveBeenCalledWith({ source: 'church', id: 'church_1' });
    expect(openLibraryFileItem).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('marks the row the viewer is showing', () => {
    renderList({ onSelectResource: vi.fn(), selected: { source: 'church', id: 'church_1' } });
    const church = screen.getByRole('button', { name: 'Church resource: Romans study guide' });
    expect(church.getAttribute('aria-current')).toBe('true');
    expect(church.closest('li')?.getAttribute('data-active')).toBe('true');
    const mine = screen.getByRole('button', { name: 'Resource: What is the gospel?' });
    expect(mine.getAttribute('aria-current')).toBeNull();
  });

  it('still opens straight away without select mode (the Library panel)', () => {
    const { onOpenResource } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Resource: What is the gospel?' }));
    expect(onOpenResource).toHaveBeenCalledWith(personal);
    fireEvent.click(screen.getByRole('button', { name: 'Church resource: Romans study guide' }));
    expect(openLibraryFileItem).toHaveBeenCalledWith('church_1');
  });

  it('puts the header action beside the shelf switch', () => {
    renderList({ shelfFilterAs: 'switch', headerAction: <button type="button">Expand</button> });
    const expand = screen.getByRole('button', { name: 'Expand' });
    expect(expand.closest('.proto-resource-toolbar')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: 'Expand' })).toHaveLength(1);
  });
});
