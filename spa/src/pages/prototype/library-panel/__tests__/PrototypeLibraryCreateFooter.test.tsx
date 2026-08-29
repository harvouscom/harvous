/**
 * Which tabs offer to start something, and when they stop offering.
 *
 * Three rules, each with a reason that is not obvious from the markup: only the kinds you
 * make by hand get a footer, searching hides it because results are a place you are passing
 * through, and a space that would refuse the sheet shows no button rather than a button that
 * fails at the far end of a form.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const organize = {
  run: vi.fn(),
  canCreateCollections: true,
  openCreateFolder: vi.fn(),
  openCreateThread: vi.fn(),
};
const closeLibraryPanel = vi.fn();

vi.mock('../../../../lib/prototype-organize-runner-store', () => ({
  useOrganizeApi: () => organize,
}));
vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ closeLibraryPanel }),
}));

const { default: PrototypeLibraryCreateFooter } = await import('../PrototypeLibraryCreateFooter');

function footer(tab: string, searching = false) {
  const { container } = render(
    <PrototypeLibraryCreateFooter tab={tab as never} searching={searching} />,
  );
  return container.querySelector('.proto-collection-grid-actions__btn')?.textContent ?? null;
}

beforeEach(() => {
  organize.canCreateCollections = true;
  vi.clearAllMocks();
});

describe('which tabs offer one', () => {
  it('offers the three kinds you make by hand', () => {
    expect(footer('notes')).toBe('New note');
    expect(footer('folders')).toBe('New folder');
    expect(footer('threads')).toBe('New Thread');
  });

  it('offers nothing for the kinds that arrive some other way', () => {
    // Highlights come from reading, scripture from the canon, resources from a file.
    expect(footer('highlights')).toBeNull();
    expect(footer('scripture')).toBeNull();
    expect(footer('resources')).toBeNull();
  });

  it('offers nothing on Everything, which is not a kind', () => {
    expect(footer('all')).toBeNull();
  });
});

describe('when it stands down', () => {
  it('hides while searching', () => {
    expect(footer('folders', true)).toBeNull();
  });

  it('hides the collection kinds where the space would refuse them', () => {
    organize.canCreateCollections = false;
    expect(footer('folders')).toBeNull();
    expect(footer('threads')).toBeNull();
  });

  it('still offers a note there — a note is not a collection', () => {
    organize.canCreateCollections = false;
    expect(footer('notes')).toBe('New note');
  });
});

describe('what pressing it does', () => {
  it('raises the host sheet for a folder', () => {
    render(<PrototypeLibraryCreateFooter tab={'folders' as never} searching={false} />);
    screen.getByText('New folder').click();
    expect(organize.openCreateFolder).toHaveBeenCalled();
  });

  it('closes the panel behind a new note, which opens in the pane underneath', () => {
    render(<PrototypeLibraryCreateFooter tab={'notes' as never} searching={false} />);
    screen.getByText('New note').click();
    expect(closeLibraryPanel).toHaveBeenCalledWith({ preserveHistory: true });
  });
});
