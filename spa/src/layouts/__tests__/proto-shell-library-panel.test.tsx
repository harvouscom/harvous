/**
 * The Library panel's state machine.
 *
 * Shell-level for the same reason the expanded tool's tests are: the failures worth
 * catching are all about how the panel behaves when something *else* moves — a space
 * switch under it, a Back gesture, a breakpoint flip — and none of those are visible
 * from inside the panel's own components.
 *
 * The one rule here that has no precedent elsewhere in the shell is the re-scope: every
 * other main-pane overlay closes when the location moves, and this one does not. That
 * asymmetry is load-bearing (the space switcher lives in the panel's own header), so it
 * gets tests from both directions.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_1' }),
}));

const { ProtoShellProvider, useProtoShell } = await import('../proto-shell-context');
const { PROTO_LIBRARY_PANEL_MS } = await import('../proto-motion');
const { HOME_LOCATION, churchParent } = await import('../proto-location');

type Shell = ReturnType<typeof useProtoShell>;

function renderShell() {
  const ref: { current: Shell | null } = { current: null };
  function Probe() {
    ref.current = useProtoShell();
    return null;
  }
  render(
    <ProtoShellProvider>
      <Probe />
    </ProtoShellProvider>,
  );
  return ref as { current: Shell };
}

/** Runs the exit timer the way a real close does. */
function flushExit() {
  act(() => {
    vi.advanceTimersByTime(PROTO_LIBRARY_PANEL_MS + 10);
  });
}

/**
 * The exit timer keeps the panel mounted for its morph, so the two numbers have to
 * agree. Same drift risk as every other pair of these: a constant in TypeScript and a
 * duration in CSS, with nothing but this test connecting them.
 */
describe('the exit timer matches the CSS it is waiting for', () => {
  it('PROTO_LIBRARY_PANEL_MS equals --pds-duration-morph', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const tokens = readFileSync(
      resolve(process.cwd(), 'spa/src/styles/prototype-tokens.css'),
      'utf8',
    );
    const declared = /--pds-duration-morph:\s*(\d+)ms/.exec(tokens);
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(PROTO_LIBRARY_PANEL_MS);
  });
});

describe('library panel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState({}, '');
  });

  it('opens at the view it was asked for, and stays open', () => {
    const shell = renderShell();
    expect(shell.current.libraryPanelView).toBeNull();

    act(() => shell.current.openLibraryPanel({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } }));
    expect(shell.current.libraryPanelView).toEqual({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } });
    expect(shell.current.libraryPanelExiting).toBe(false);

    // Nothing pending should sweep it away on its own.
    flushExit();
    expect(shell.current.libraryPanelView).toEqual({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } });
  });

  it('stays mounted through the exit morph, then clears', () => {
    const shell = renderShell();
    act(() => shell.current.openLibraryPanel({ tab: 'all', drill: null }));

    act(() => shell.current.closeLibraryPanel());
    // Still mounted — the panel has to be in the DOM to morph back into the chip.
    expect(shell.current.libraryPanelView).toEqual({ tab: 'all', drill: null });
    expect(shell.current.libraryPanelExiting).toBe(true);

    flushExit();
    expect(shell.current.libraryPanelView).toBeNull();
    expect(shell.current.libraryPanelExiting).toBe(false);
  });

  it('reopening cancels a pending exit rather than letting it fire late', () => {
    const shell = renderShell();
    act(() => shell.current.openLibraryPanel({ tab: 'all', drill: null }));
    act(() => shell.current.closeLibraryPanel());
    act(() => shell.current.openLibraryPanel({ tab: 'all', drill: null }));

    flushExit();
    // The stale timer must not clear the panel we just reopened.
    expect(shell.current.libraryPanelView).toEqual({ tab: 'all', drill: null });
    expect(shell.current.libraryPanelExiting).toBe(false);
  });

  it('drilling inside the panel changes the view without touching history', () => {
    const shell = renderShell();
    act(() => shell.current.openLibraryPanel({ tab: 'all', drill: null }));
    const afterOpen = window.history.length;

    act(() => shell.current.setLibraryPanelView({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } }));
    expect(shell.current.libraryPanelView).toEqual({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } });
    // One entry per open, not per drill — Back is for leaving, not for unwinding taps.
    expect(window.history.length).toBe(afterOpen);
  });

  it('answers Back, and only its own Back', () => {
    const shell = renderShell();
    act(() => shell.current.openLibraryPanel({ tab: 'all', drill: null }));
    expect((window.history.state as Record<string, unknown>)?.protoLibraryPanel).toBe(true);

    act(() => {
      window.history.replaceState({}, '');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    flushExit();
    expect(shell.current.libraryPanelView).toBeNull();
  });

  it('does not leave its history entry behind on an explicit close', () => {
    const shell = renderShell();
    act(() => shell.current.openLibraryPanel({ tab: 'all', drill: null }));
    act(() => shell.current.closeLibraryPanel());
    flushExit();
    expect((window.history.state as Record<string, unknown>)?.protoLibraryPanel).toBeFalsy();
  });

  it('closes the expanded tool rather than stacking on top of it', () => {
    // Two main-pane overlays at once is one surface hidden under another and two Backs
    // to get out of.
    const shell = renderShell();
    act(() => shell.current.openExpandedSidebar('planner'));
    act(() => shell.current.openLibraryPanel({ tab: 'all', drill: null }));

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(shell.current.expandedSidebarTool).toBeNull();
    expect(shell.current.libraryPanelView).toEqual({ tab: 'all', drill: null });
  });

  describe('a space switch re-scopes it instead of closing it', () => {
    it('survives the move and returns to root', () => {
      // The switcher lives in the panel's own header, so a move is the reader steering
      // this surface — closing it would dismiss the thing they are using. Root, not the
      // current view, because a folder from the space you just left is not in this one.
      const shell = renderShell();
      act(() => shell.current.openLibraryPanel({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } }));

      act(() => shell.current.setLocation({ parent: churchParent('org_1'), spaceId: null }));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      /* Tab kept, drill cleared: the folder does not exist in the space you moved to, but
         the tab does — and resetting it would discard a choice just made. */
      expect(shell.current.libraryPanelView).toEqual({ tab: 'folders', drill: null });
      expect(shell.current.libraryPanelExiting).toBe(false);
    });

    it('leaves a redundant setLocation alone', () => {
      // Several callers re-assert the location they are already at (a nav sync, a route
      // settling). Those must not bounce a drilled panel back to its root.
      const shell = renderShell();
      const church = { parent: churchParent('org_1'), spaceId: null };
      act(() => shell.current.setLocation(church));
      act(() => shell.current.openLibraryPanel({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } }));

      act(() => shell.current.setLocation(church));
      expect(shell.current.libraryPanelView).toEqual({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } });
    });

    it('does not re-scope a panel that was never open', () => {
      const shell = renderShell();
      act(() => shell.current.setLocation({ parent: churchParent('org_1'), spaceId: null }));
      expect(shell.current.libraryPanelView).toBeNull();
    });

    it('still closes the expanded tool on the same move', () => {
      // The two rules live in one function; this is the half that did not change.
      const shell = renderShell();
      act(() => shell.current.setLocation({ parent: churchParent('org_1'), spaceId: null }));
      act(() => shell.current.openExpandedSidebar('planner'));

      act(() => shell.current.setLocation(HOME_LOCATION));
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(shell.current.expandedSidebarTool).toBeNull();
    });
  });

  it('leaves the sidebar’s own list state alone', () => {
    // The sidebar is still reachable behind ⇧S this phase. Browsing the panel must not
    // leave it somewhere new, or the fallback surface moves under the reader's feet.
    const shell = renderShell();
    act(() => shell.current.setSidebarListMode('highlights'));
    act(() => shell.current.setSidebarFolderDrilldown('Sermons'));

    act(() => shell.current.openLibraryPanel({ tab: 'threads', drill: null }));
    act(() => shell.current.setLibraryPanelView({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Prayers' } }));

    expect(shell.current.sidebarListMode).toBe('highlights');
    expect(shell.current.sidebarFolderDrilldown).toBe('Sermons');
  });

  it('persists nothing across a remount', () => {
    // Every open derives its view from where the reader is, which is what makes
    // persistence unnecessary rather than merely skipped.
    const first = renderShell();
    act(() => first.current.openLibraryPanel({ tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } }));

    const second = renderShell();
    expect(second.current.libraryPanelView).toBeNull();
  });
});
