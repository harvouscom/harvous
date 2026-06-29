/**
 * Sidebar toolbar — desktop column chrome or mobile drawer header.
 * Space switcher + icon-only list mode menu; hide-sidebar on desktop only.
 * Admin mode: back to app + sidebar toggle only (no space/list chrome).
 */
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { PROTO_SIDEBAR_TOOLBAR_SUPPRESS_BELOW, useProtoShell } from '../../layouts/proto-shell-context';
import SpaceSwitcherMenu from './SpaceSwitcherMenu';
import ListViewMenu from './ListViewMenu';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import SplitColumnToggleIcon from './SplitColumnToggleIcon';
import { PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import '@/styles/admin-usage.css';

export default function PrototypeSidebarToolbar({
  variant = 'desktop',
  admin = false,
}: {
  variant?: 'desktop' | 'drawer';
  admin?: boolean;
}) {
  const navigate = useNavigate();
  const { homeSpaceId, authReady } = usePrototypeHomeSpaceId();
  const { sidebarWidth, toggleDesktopSidebar, desktopSidebarCollapsed, sidebarExiting } = useProtoShell();
  const showShiftHints = usePrototypeShiftHints();

  const isDrawer = variant === 'drawer';
  const showClusterChrome = !admin && (isDrawer || sidebarWidth >= PROTO_SIDEBAR_TOOLBAR_SUPPRESS_BELOW);
  const sidebarOpen = !desktopSidebarCollapsed && !sidebarExiting;

  return (
    <div
      className={[
        'proto-sidebar-toolbar',
        isDrawer ? 'proto-sidebar-toolbar--drawer' : '',
        admin ? 'proto-sidebar-toolbar--admin' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {admin ? (
        <button
          type="button"
          className="proto-admin-toolbar__back proto-sidebar-toolbar__back"
          onClick={() => navigate({ to: prototypeHomeRouteTo() })}
        >
          <Icon name="caret-left" size={14} aria-hidden />
          <span>Back to Harvous</span>
        </button>
      ) : null}
      <div className="proto-sidebar-toolbar__cluster">
        {showClusterChrome ? (
          <>
            <SpaceSwitcherMenu homeSpaceId={homeSpaceId} authReady={authReady} />
            <ListViewMenu disabled={!homeSpaceId} variant="icon-only" />
          </>
        ) : null}
        {!isDrawer ? (
          <PrototypeToolbarShortcutItem shortcut="S" showShortcut={showShiftHints}>
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
