/**
 * Sidebar toolbar — desktop column chrome or mobile drawer header.
 *
 * Spaces and the list views are one joined switch here, not two orbs. They were always
 * two halves of a single choice — which layer the sidebar is showing — and the sidebar is
 * wide enough to say so in words, which the toolbar never was. The orb pair survives below
 * `PROTO_SIDEBAR_TOOLBAR_SUPPRESS_BELOW`, where labels stop fitting.
 *
 * Admin mode: back to app + sidebar toggle only (no space/list chrome).
 */
import type { CSSProperties } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useActiveSpace } from '../../hooks/useActiveSpace';
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
  const { isSharedSpace, activeSpaceId } = useActiveSpace();
  const { sidebarWidth, toggleDesktopSidebar, desktopSidebarCollapsed, sidebarExiting, sidebarListMode, sidebarLayer } = useProtoShell();
  const showShiftHints = usePrototypeShiftHints();

  const isDrawer = variant === 'drawer';
  /** Wide enough for labels — the drawer always is; a resized desktop column may not be. */
  const roomForLabels = isDrawer || sidebarWidth >= PROTO_SIDEBAR_TOOLBAR_SUPPRESS_BELOW;
  const showLayerSegmented = !admin && roomForLabels;
  /* Too narrow for the switch, so it falls back to what a column this thin always showed:
     the list orb alone. The space half is the one that goes — its label is a space title
     of unbounded length, where the list half's is one of six known words. */
  const showListOrbOnly = !admin && !roomForLabels;
  const sidebarOpen = !desktopSidebarCollapsed && !sidebarExiting;
  const listDisabled = !(isSharedSpace ? activeSpaceId : homeSpaceId);
  /* The sliding thumb needs both halves on screen to have something to slide between,
     and the space half renders nothing until auth resolves. Until then the halves keep
     their own selected fill — see `.proto-seg-track`. */
  const slidingThumb = authReady;

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
          aria-label="Back to Harvous"
          onClick={() => navigate({ to: prototypeHomeRouteTo() })}
        >
          <Icon name="caret-left" size={14} aria-hidden />
          <span className="proto-admin-toolbar__back-label">Back to Harvous</span>
        </button>
      ) : null}
      <div className="proto-sidebar-toolbar__cluster">
        {showLayerSegmented ? (
          <div
            className={`proto-sidebar-seg${slidingThumb ? ' proto-seg-track' : ''}`}
            role="group"
            aria-label="Sidebar view"
            style={{ '--proto-seg-index': sidebarLayer === 'list' ? 1 : 0 } as CSSProperties}
          >
            <SpaceSwitcherMenu homeSpaceId={homeSpaceId} authReady={authReady} trigger="segment" />
            <ListViewMenu disabled={listDisabled} variant="segment" />
          </div>
        ) : null}
        {showListOrbOnly ? <ListViewMenu disabled={listDisabled} variant="icon-only" /> : null}
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
