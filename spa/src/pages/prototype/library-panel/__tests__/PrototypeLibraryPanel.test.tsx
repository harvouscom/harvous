/**
 * The Library panel's chrome.
 *
 * The behaviors here are the ones the expanded panel learned the hard way and this one
 * inherited: a dismissal that fires on mousedown rather than click, an Escape that yields
 * to whatever inside claimed it first, and an "outside" that does not count portaled
 * menus — the space switcher's popover lives outside this panel in the DOM and inside it
 * to the reader. Each has a real regression behind it, so each gets a test.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_1' }),
}));

const { default: PrototypeLibraryPanel } = await import('../PrototypeLibraryPanel');
const { ProtoShellProvider } = await import('../../../../layouts/proto-shell-context');

function renderPanel(
  overrides: Partial<Parameters<typeof PrototypeLibraryPanel>[0]> = {},
) {
  const onClose = vi.fn();
  const onBackToRoot = vi.fn();
  const { container } = render(
    <ProtoShellProvider>
      <PrototypeLibraryPanel
        view={{ tab: 'all', drill: null }}
        exiting={false}
        isMobile={false}
        onClose={onClose}
        onBackToRoot={onBackToRoot}
        {...overrides}
      >
        <div data-testid="body">contents</div>
      </PrototypeLibraryPanel>
    </ProtoShellProvider>,
  );
  return { onClose, onBackToRoot, container };
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '');
});

describe('chrome', () => {
  it('is a region, not a dialog', () => {
    // No focus trap and no scrim: the toolbar above stays live and the note underneath
    // stays reachable. Announcing it as a dialog would promise otherwise.
    renderPanel();
    const panel = screen.getByRole('region', { name: 'Library' });
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('role')).toBe('region');
  });

  it('has no title of its own at a bare tab — the search field is its identity', () => {
    const { container } = renderPanel({ view: { tab: 'highlights', drill: null } });
    expect(container.querySelector('.proto-library-panel__title')).toBeNull();
  });

  it('prefers a resolved subject for a drill view', () => {
    renderPanel({
      view: { tab: 'threads', drill: { kind: 'thread', threadId: 't1' } },
      subject: 'Life in the Spirit',
    });
    expect(screen.getByText('Life in the Spirit')).toBeTruthy();
  });

  it('names the tab its back tile returns to', () => {
    // The tile is the sidebar's own back affordance, and it says where it goes rather
    // than just "back" — the tab is where you came from.
    const { onBackToRoot } = renderPanel({
      view: { tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } },
    });
    fireEvent.click(screen.getByLabelText('Back to Folders'));
    expect(onBackToRoot).toHaveBeenCalled();
  });

  it('states the drill as a heading with its kind, not as a second control', () => {
    const { container } = renderPanel({
      view: { tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } },
    });
    expect(container.querySelector('.proto-sidebar-back-row__label')?.textContent).toBe('Sermons');
    expect(container.querySelector('.proto-sidebar-back-row__kind')?.textContent).toBe('Folder');
  });

  it('shows no back row at a bare tab, and close is always there', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.proto-library-panel__back')).toBeNull();
    /* Close moved to the header's lead and no longer swaps with back — the two are
       different jobs and used to share one slot. */
    expect(screen.getByLabelText('Close search')).toBeTruthy();
  });
});

describe('dismissal', () => {
  it('closes on Escape', () => {
    const { onClose } = renderPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves Escape alone when something inside already claimed it', () => {
    // An open menu or the search field consumes Escape first — closing the whole panel
    // out from under it loses the reader's place.
    const { onClose } = renderPanel();
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on an outside mousedown', () => {
    const { onClose } = renderPanel();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    expect(onClose).toHaveBeenCalled();
    outside.remove();
  });

  it('stays open for a mousedown inside', () => {
    const { onClose } = renderPanel();
    fireEvent.mouseDown(screen.getByTestId('body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open for a portaled menu, which is outside in the DOM and inside to the reader', () => {
    // The header's space switcher renders its menu in a portal. Treating that as
    // "outside" would close the panel the moment you tried to switch space in it.
    const { onClose } = renderPanel();
    const portaled = document.createElement('div');
    portaled.setAttribute('role', 'menu');
    document.body.appendChild(portaled);
    const item = document.createElement('button');
    portaled.appendChild(item);

    fireEvent.mouseDown(item);
    expect(onClose).not.toHaveBeenCalled();
    portaled.remove();
  });

  it('ignores portaled dialogs and popover shells too', () => {
    const { onClose } = renderPanel();
    for (const selector of ['proto-menu__popover', 'proto-popover-shell']) {
      const portaled = document.createElement('div');
      portaled.className = selector;
      document.body.appendChild(portaled);
      fireEvent.mouseDown(portaled);
      portaled.remove();
    }
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the kind picker', () => {
  it('sits in the header row with the field, not in the scrolling body', () => {
    // What you are looking through, beside what you are looking for — and out of the
    // scroll container, so it cannot scroll away from the content it filters.
    const { container } = renderPanel({ tabs: <div data-testid="kind" /> });
    expect(container.querySelector('.proto-library-panel__body [data-testid="kind"]')).toBeNull();
    expect(
      container.querySelector('.proto-library-panel__actions [data-testid="kind"]'),
    ).toBeTruthy();
  });

  it('shares its cell with the space switcher rather than taking a band of its own', () => {
    const { container } = renderPanel({
      tabs: <div data-testid="kind" />,
      spaceSwitcher: <div data-testid="space" />,
    });
    const actions = container.querySelector('.proto-library-panel__actions');
    expect(actions?.querySelector('[data-testid="kind"]')).toBeTruthy();
    expect(actions?.querySelector('[data-testid="space"]')).toBeTruthy();
  });
});

describe('presentation', () => {
  it('is a panel on desktop and a sheet on mobile', () => {
    // Two different geometries, not one restyled — which is why the shell drops the
    // panel entirely on a breakpoint flip rather than carrying it across.
    const { container } = render(
      <ProtoShellProvider>
        <PrototypeLibraryPanel
          view={{ tab: 'all', drill: null }}
          exiting={false}
          isMobile
          onClose={() => {}}
          onBackToRoot={() => {}}
        >
          <div />
        </PrototypeLibraryPanel>
      </ProtoShellProvider>,
    );
    expect(container.querySelector('.proto-library-sheet')).toBeTruthy();
    expect(container.querySelector('.proto-library-panel')).toBeNull();
  });

  it('carries the exiting class so the morph can play out', () => {
    const { container } = render(
      <ProtoShellProvider>
        <PrototypeLibraryPanel
          view={{ tab: 'all', drill: null }}
          exiting
          isMobile={false}
          onClose={() => {}}
          onBackToRoot={() => {}}
        >
          <div />
        </PrototypeLibraryPanel>
      </ProtoShellProvider>,
    );
    expect(container.querySelector('.proto-library-panel--exiting')).toBeTruthy();
  });
});
