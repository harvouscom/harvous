/**
 * The expanded-sidebar tool's state machine.
 *
 * Covered here rather than through the planner because the interesting failures
 * are all shell-level: a tool that closes itself the moment something else
 * touches the location, or one that survives a Back gesture it should have
 * answered. Both are invisible in a component test of the board.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_1' }),
}));

const { ProtoShellProvider, useProtoShell } = await import('../proto-shell-context');
const { PROTO_PANEL_EXIT_MS } = await import('../proto-motion');
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
    vi.advanceTimersByTime(PROTO_PANEL_EXIT_MS + 10);
  });
}

describe('expanded sidebar tool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState({}, '');
  });

  it('opens, and stays open until something closes it', () => {
    const shell = renderShell();
    expect(shell.current.expandedSidebarTool).toBeNull();

    act(() => shell.current.openExpandedSidebar('planner'));
    expect(shell.current.expandedSidebarTool).toBe('planner');
    expect(shell.current.expandedSidebarExiting).toBe(false);

    // Nothing pending should sweep it away on its own.
    flushExit();
    expect(shell.current.expandedSidebarTool).toBe('planner');
  });

  it('stays mounted through the exit animation, then clears', () => {
    const shell = renderShell();
    act(() => shell.current.openExpandedSidebar('planner'));

    act(() => shell.current.closeExpandedSidebar());
    // Still mounted — the panel needs to be in the DOM to animate out.
    expect(shell.current.expandedSidebarTool).toBe('planner');
    expect(shell.current.expandedSidebarExiting).toBe(true);

    flushExit();
    expect(shell.current.expandedSidebarTool).toBeNull();
    expect(shell.current.expandedSidebarExiting).toBe(false);
  });

  it('reopening cancels a pending exit rather than letting it fire late', () => {
    const shell = renderShell();
    act(() => shell.current.openExpandedSidebar('planner'));
    act(() => shell.current.closeExpandedSidebar());
    act(() => shell.current.openExpandedSidebar('planner'));

    flushExit();
    // The stale timer must not clear the tool we just reopened.
    expect(shell.current.expandedSidebarTool).toBe('planner');
    expect(shell.current.expandedSidebarExiting).toBe(false);
  });

  it('closes when the viewer leaves the context that opened it', () => {
    const shell = renderShell();
    act(() => shell.current.setLocation({ parent: churchParent('org_1'), spaceId: null }));
    act(() => shell.current.openExpandedSidebar('planner'));

    act(() => shell.current.setLocation(HOME_LOCATION));
    flushExit();
    expect(shell.current.expandedSidebarTool).toBeNull();
  });

  it('survives a redundant setLocation to where it already is', () => {
    // The regression this guards: `setLocation` closes the tool unconditionally,
    // so any effect that re-asserts the current location — a nav sync, a route
    // settling — would dismiss a planner the user just opened.
    const shell = renderShell();
    const church = { parent: churchParent('org_1'), spaceId: null };
    act(() => shell.current.setLocation(church));
    act(() => shell.current.openExpandedSidebar('planner'));

    act(() => shell.current.setLocation(church));
    flushExit();
    expect(shell.current.expandedSidebarTool).toBe('planner');
  });

  it('closes when the desktop sidebar collapses out from under it', () => {
    const shell = renderShell();
    act(() => shell.current.openExpandedSidebar('planner'));

    act(() => shell.current.toggleDesktopSidebar());
    flushExit();
    expect(shell.current.expandedSidebarTool).toBeNull();
  });

  it('answers Back, and only its own Back', () => {
    const shell = renderShell();
    act(() => shell.current.openExpandedSidebar('planner'));
    expect((window.history.state as Record<string, unknown>)?.protoExpandedSidebarTool).toBe(true);

    act(() => {
      window.history.replaceState({}, '');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    flushExit();
    expect(shell.current.expandedSidebarTool).toBeNull();
  });

  it('does not leave its history entry behind on an explicit close', () => {
    const shell = renderShell();
    act(() => shell.current.openExpandedSidebar('planner'));
    act(() => shell.current.closeExpandedSidebar());
    flushExit();
    // preserveHistory is for navigating away; a plain close pops its own entry.
    expect((window.history.state as Record<string, unknown>)?.protoExpandedSidebarTool).toBeFalsy();
  });
});
