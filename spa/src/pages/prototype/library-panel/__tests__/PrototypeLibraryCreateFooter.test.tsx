/**
 * Which tabs offer to start something, and when they stop offering.
 *
 * Four rules, each with a reason that is not obvious from the markup: only the kinds you
 * make by hand get a *create* footer, Everything gets Discover instead — it is the one tab
 * whose things are not made by hand, so the honest offer there is the part that is not yours
 * yet — searching hides it because results are a place you are passing through, and a space
 * that would refuse the sheet shows no button rather than a button that fails at the far end
 * of a form.
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
const setActiveSpaceId = vi.fn();
const ensureSidebarExpanded = vi.fn();
const openExpandedSidebar = vi.fn();

vi.mock('../../../../lib/prototype-organize-runner-store', () => ({
  useOrganizeApi: () => organize,
}));
vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ closeLibraryPanel, setActiveSpaceId, ensureSidebarExpanded, openExpandedSidebar }),
}));

const { default: PrototypeLibraryCreateFooter } = await import('../PrototypeLibraryCreateFooter');
const { consumePendingDiscoverKind } = await import('../../../../lib/pending-discover-kind');

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

  it('offers Discover on Everything, which is not a kind to make by hand', () => {
    // Everything's corner has always been the one with nothing to create — see
    // PrototypeLibraryCreateFooter's own comment. Out to Discover is what fills it.
    expect(footer('all')).toBe('Discover');
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

describe('New note from My Home, inside a shared space', () => {
  function pressNewNote(homeSpaceId: string | null) {
    const seen: Event[] = [];
    const listen = (event: Event) => seen.push(event);
    window.addEventListener('prototypeShortcutNewNote', listen);
    render(
      <PrototypeLibraryCreateFooter
        tab={'notes' as never}
        searching={false}
        homeSpaceId={homeSpaceId}
      />,
    );
    screen.getByText('New note').click();
    window.removeEventListener('prototypeShortcutNewNote', listen);
    return seen;
  }

  it('moves the shell home and names Home as where the note goes', () => {
    // A note started from your own library is a Home note. Moving first keeps it from
    // landing in the room the toolbar still names; the target on the event survives the
    // layout's handler reading the shell before that move has re-rendered it.
    const seen = pressNewNote('space_home');
    expect(setActiveSpaceId).toHaveBeenCalledWith(null);
    expect(seen).toHaveLength(1);
    expect((seen[0] as CustomEvent).detail).toEqual({ targetSpaceId: 'space_home' });
  });

  it('leaves the shell and the target alone on the room side', () => {
    const seen = pressNewNote(null);
    expect(setActiveSpaceId).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
    expect((seen[0] as CustomEvent).detail ?? null).toBeNull();
  });
});

describe('the secondary Discover beside a create button', () => {
  /*
   * The Notes one did nothing for as long as it existed. Its handler closed over a const
   * declared below the branch that returned it, so every click threw a TDZ ReferenceError
   * before reaching the shell — and a render test cannot see that, only a press can.
   */
  function pressSecondaryDiscover(tab: 'notes' | 'threads') {
    render(<PrototypeLibraryCreateFooter tab={tab as never} searching={false} />);
    screen.getByText('Discover').click();
  }

  it('opens Discover from Notes, on studies', () => {
    pressSecondaryDiscover('notes');
    expect(closeLibraryPanel).toHaveBeenCalled();
    expect(openExpandedSidebar).toHaveBeenCalledWith('discover');
    expect(consumePendingDiscoverKind()).toBe('note');
  });

  it('opens Discover from Threads, on series', () => {
    pressSecondaryDiscover('threads');
    expect(openExpandedSidebar).toHaveBeenCalledWith('discover');
    expect(consumePendingDiscoverKind()).toBe('pack');
  });

  it('opens Discover from Everything, where it is the primary', () => {
    render(<PrototypeLibraryCreateFooter tab={'all' as never} searching={false} />);
    screen.getByText('Discover').click();
    expect(openExpandedSidebar).toHaveBeenCalledWith('discover');
  });
});
