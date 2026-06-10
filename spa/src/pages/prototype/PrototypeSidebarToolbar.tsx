/**
 * Sidebar toolbar — desktop column chrome or mobile drawer header.
 * Space switcher + icon-only list mode menu; hide-sidebar on desktop only.
 */
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { PROTO_SIDEBAR_TOOLBAR_SUPPRESS_BELOW, useProtoShell } from '../../layouts/proto-shell-context';
import SpaceSwitcherMenu from './SpaceSwitcherMenu';
import ListViewMenu from './ListViewMenu';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import SplitColumnToggleIcon from './SplitColumnToggleIcon';
import { PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';

export default function PrototypeSidebarToolbar({ variant = 'desktop' }: { variant?: 'desktop' | 'drawer' }) {
  const { homeSpaceId, authReady } = usePrototypeHomeSpaceId();
  const { sidebarWidth, toggleDesktopSidebar, desktopSidebarCollapsed, sidebarExiting } = useProtoShell();
  const showShiftHints = usePrototypeShiftHints();

  const isDrawer = variant === 'drawer';
  const showClusterChrome = isDrawer || sidebarWidth >= PROTO_SIDEBAR_TOOLBAR_SUPPRESS_BELOW;
  const sidebarOpen = !desktopSidebarCollapsed && !sidebarExiting;

  return (
    <div className={['proto-sidebar-toolbar', isDrawer ? 'proto-sidebar-toolbar--drawer' : ''].filter(Boolean).join(' ')}>
      <div className="proto-sidebar-toolbar__cluster">
        {showClusterChrome ? (
          <>
            <SpaceSwitcherMenu homeSpaceId={homeSpaceId} authReady={authReady} />
            <ListViewMenu disabled={!homeSpaceId} variant="icon-only" />
          </>
        ) : null}
        {!isDrawer ? (
          <PrototypeToolbarShortcutItem shortcut="B" showShortcut={showShiftHints}>
            <button
              type="button"
              className="proto-toolbar-icon-btn"
              title="Hide sidebar"
              aria-label="Hide sidebar"
              onClick={toggleDesktopSidebar}
            >
              <SplitColumnToggleIcon side="left" open={sidebarOpen} size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
            </button>
          </PrototypeToolbarShortcutItem>
        ) : null}
      </div>
    </div>
  );
}
