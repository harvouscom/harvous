import { useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import AccountMenu from '../../../spa/src/pages/prototype/AccountMenu';
import PrototypeToolbarShortcutItem from '../../../spa/src/pages/prototype/PrototypeToolbarShortcutItem';
import SplitColumnToggleIcon from '../../../spa/src/pages/prototype/SplitColumnToggleIcon';
import { PROTO_TOOLBAR_ORB_ICON_SIZE } from '../../../spa/src/pages/prototype/proto-toolbar-tokens';
import { usePrototypeShiftHints } from '../../../spa/src/hooks/usePrototypeShiftHints';
import { useProtoShell } from '../../../spa/src/layouts/proto-shell-context';
import { isPrototypeAdminPath, prototypeHomeRouteTo } from '@/lib/prototype-path';
import '@/styles/admin-usage.css';

function AdminToolbarNavCluster({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const navigate = useNavigate();
  const {
    toggleDesktopSidebar,
    desktopSidebarCollapsed,
    sidebarExiting,
    ensureSidebarExpanded,
    isMobileSidebar,
    drawerOpen,
    toggleDrawer,
  } = useProtoShell();
  const showShiftHints = usePrototypeShiftHints();
  const sidebarOpen = !desktopSidebarCollapsed && !sidebarExiting;

  const onSidebarToggle = isMobileSidebar
    ? toggleDrawer
    : sidebarCollapsed
      ? ensureSidebarExpanded
      : toggleDesktopSidebar;
  const sidebarToggleOpen = isMobileSidebar ? drawerOpen && !sidebarExiting : sidebarCollapsed ? false : sidebarOpen;
  const sidebarToggleLabel = isMobileSidebar || sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar';

  return (
    <>
      <button
        type="button"
        className="proto-admin-toolbar__back"
        onClick={() => navigate({ to: prototypeHomeRouteTo() })}
      >
        <Icon name="caret-left" size={14} aria-hidden />
        <span>Back to Harvous</span>
      </button>
      <PrototypeToolbarShortcutItem shortcut="S" showShortcut={showShiftHints}>
        <button
          type="button"
          className="proto-toolbar-icon-btn"
          title={sidebarToggleLabel}
          aria-label={sidebarToggleLabel}
          onClick={onSidebarToggle}
        >
          <SplitColumnToggleIcon side="left" open={sidebarToggleOpen} size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
        </button>
      </PrototypeToolbarShortcutItem>
    </>
  );
}

export default function AdminToolbar({ variant = 'split' }: { variant?: 'split' | 'detail' | 'unified' }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { desktopSidebarCollapsed, sidebarExiting } = useProtoShell();

  const sidebarCollapsed = desktopSidebarCollapsed || sidebarExiting;
  const showCollapsedChrome = variant !== 'split' && variant === 'detail' && sidebarCollapsed;
  const sectionLabel = pathname.includes('/admin/votd')
    ? "Today's Passage"
    : pathname.includes('/admin/usage')
      ? 'Platform usage'
      : 'Admin';

  const leftChrome =
    variant === 'split' || variant === 'unified' ? (
      <AdminToolbarNavCluster sidebarCollapsed={variant === 'split' && sidebarCollapsed} />
    ) : showCollapsedChrome ? (
      <AdminToolbarNavCluster sidebarCollapsed />
    ) : null;

  return (
    <header className="proto-admin-toolbar" aria-label="Harvous admin">
      <div className="proto-admin-toolbar__left">{leftChrome}</div>
      <div className="proto-admin-toolbar__center">
        <span className="proto-admin-toolbar__badge">Admin</span>
        {isPrototypeAdminPath(pathname) ? (
          <span className="proto-admin-toolbar__title pds-list-title">{sectionLabel}</span>
        ) : null}
      </div>
      <div className="proto-admin-toolbar__right">
        <AccountMenu />
      </div>
    </header>
  );
}
