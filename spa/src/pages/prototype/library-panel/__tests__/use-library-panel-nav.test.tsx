/**
 * Activity's greeting chips, pointed at the Library panel.
 *
 * The chip that matters most here is Scripture. On the sidebar it could only reach the
 * Scripture list, because the book-level drill was component-local state the greeting had
 * no handle on — a chip reading "Romans" that delivered "Scripture". Moving the drill
 * into shell state is what fixed it, so the fix gets a test that would fail if it
 * regressed to opening the section.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_1' }),
}));

const { ProtoShellProvider, useProtoShell } = await import('../../../../layouts/proto-shell-context');
const { useLibraryPanelNav } = await import('../use-library-panel-nav');

type Harness = {
  nav: ReturnType<typeof useLibraryPanelNav>;
  shell: ReturnType<typeof useProtoShell>;
};

function renderNav() {
  const ref: { current: Harness | null } = { current: null };
  function Probe() {
    ref.current = { nav: useLibraryPanelNav(), shell: useProtoShell() };
    return null;
  }
  render(
    <ProtoShellProvider>
      <Probe />
    </ProtoShellProvider>,
  );
  return ref as { current: Harness };
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '');
});

describe('useLibraryPanelNav', () => {
  it('opens a scripture chip at the book, not the section', () => {
    const h = renderNav();
    act(() => h.current.nav.openScriptureBook(45));
    expect(h.current.shell.libraryPanelView).toEqual({
      tab: 'scripture',
      drill: { kind: 'scripture', drill: { level: 'passages', bookOrder: 45 } },
    });
  });

  it('opens a folder chip at that folder', () => {
    const h = renderNav();
    act(() => h.current.nav.openFolder('Sermons'));
    expect(h.current.shell.libraryPanelView).toEqual({
      tab: 'folders',
      drill: { kind: 'folder', folderKey: 'Sermons' },
    });
  });

  it('opens a thread chip at that thread', () => {
    const h = renderNav();
    act(() => h.current.nav.openThread('thread_1'));
    expect(h.current.shell.libraryPanelView).toEqual({
      tab: 'threads',
      drill: { kind: 'thread', threadId: 'thread_1' },
    });
  });

  it('carries a tag in as the opening query rather than through a separate handshake', () => {
    // This used to go through `sidebarTagSearchIntent` — a second piece of state whose
    // only job was to tell the sidebar what the chip had already decided.
    const h = renderNav();
    act(() => h.current.nav.openTag('tag_1', 'grace'));
    expect(h.current.shell.libraryPanelView).toEqual({
      tab: 'all',
      drill: null,
      querySeed: 'grace',
    });
  });

  it('maps list modes onto sections', () => {
    const h = renderNav();
    act(() => h.current.nav.openList('highlights'));
    expect(h.current.shell.libraryPanelView).toEqual({ tab: 'highlights', drill: null });
  });

  it('sends folders to the Folders tab', () => {
    const h = renderNav();
    act(() => h.current.nav.openList('folders'));
    expect(h.current.shell.libraryPanelView).toEqual({ tab: 'folders', drill: null });
  });

  it('leaves the sidebar alone', () => {
    // The whole point of the rewiring: a chip used to summon the rail, and now it opens
    // the panel instead. If this starts failing, the two surfaces are coupled again.
    const h = renderNav();
    const before = h.current.shell.sidebarListMode;
    act(() => h.current.nav.openList('highlights'));
    expect(h.current.shell.sidebarListMode).toBe(before);
    expect(h.current.shell.desktopSidebarCollapsed).toBe(true);
  });
});
