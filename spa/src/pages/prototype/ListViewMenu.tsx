/**
 * List view popover — Notes, Folders, Highlights, Scripture (native SidebarPanelView parity).
 * Icon-only trigger lives in the sidebar toolbar cluster (desktop column + mobile drawer header).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { useProtoShell, type SidebarListMode } from '../../layouts/proto-shell-context';
import {
  PROTO_TOOLBAR_ICON_SIZE,
  PROTO_TOOLBAR_ORB_ICON_SIZE,
  PROTO_TOOLBAR_POPOVER_OFFSET,
} from './proto-toolbar-tokens';
import { computeRightAnchoredPopoverPosition } from './proto-popover-position';
import ProtoPopoverShell from './ProtoPopoverShell';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import { SIDEBAR_LIST_MODES } from './proto-sidebar-list-modes';

const MENU_Z_INDEX = 6000;
const LIST_VIEW_POPOVER_WIDTH = 260;
const LIST_VIEW_POPOVER_FALLBACK_HEIGHT = 220;

function listModeShortLabel(mode: SidebarListMode): string {
  switch (mode) {
    case 'notes':      return 'Notes';
    case 'folders':    return 'Folders';
    case 'highlights': return 'Highlights';
    case 'scripture':  return 'Scripture';
    case 'threads':    return 'Threads';
    case 'resources':  return 'Resources';
    default:           return 'List view';
  }
}

function listModeTitle(mode: SidebarListMode): string {
  switch (mode) {
    case 'notes':      return 'Notes list';
    case 'folders':    return 'Folders list';
    case 'highlights': return 'Highlights list';
    case 'scripture':  return 'Scripture index';
    case 'threads':    return 'Threads';
    case 'resources':  return 'Resource library';
    default:           return 'List view';
  }
}

function ListModeTriggerIcon({ mode, size }: { mode: SidebarListMode; size: number }) {
  switch (mode) {
    case 'notes':      return <Icon name="note-sticky" size={size} />;
    case 'folders':    return <Icon name="folder" size={size} />;
    case 'highlights': return <Icon name="highlighter" size={size} />;
    case 'scripture':  return <Icon name="scroll" size={size} />;
    case 'threads':    return <Icon name="arrow-right-arrow-left" size={size} />;
    case 'resources':  return <Icon name="newspaper" size={size} />;
    default:           return <Icon name="note-sticky" size={size} />;
  }
}

export default function ListViewMenu({
  disabled,
  variant = 'icon-only',
}: {
  disabled?: boolean;
  variant?: 'icon-only' | 'full';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number } | null>(null);
  const {
    sidebarLayer,
    setSidebarLayer,
    sidebarListMode,
    setSidebarListMode,
    setSidebarFolderDrilldown,
    ensureSidebarExpanded,
  } = useProtoShell();
  const showShiftHints = usePrototypeShiftHints();

  const pick = (mode: SidebarListMode) => {
    setSidebarFolderDrilldown(undefined);
    setSidebarListMode(mode);
    ensureSidebarExpanded();
    setOpen(false);
  };

  const title = listModeTitle(sidebarListMode);
  const iconSize = variant === 'icon-only' ? PROTO_TOOLBAR_ORB_ICON_SIZE : 14;
  const isPortaled = variant === 'icon-only';
  /** Toolbar orb doubles as the list half of the layer toggle; the full variant stays a plain dropdown. */
  const isLayerToggle = variant === 'icon-only';
  /** Also the visible readout — `data-active` below marks the current layer. */
  const isActiveLayer = sidebarLayer === 'list';

  // Mirrors SpaceSwitcherMenu: inactive orb is a fast view toggle (one click
  // straight to this layer), active orb opens the menu. Keeping the two orbs
  // symmetrical is the point — an asymmetry here is what would make the
  // toolbar feel arbitrary.
  const onTriggerClick = () => {
    if (disabled) return;
    if (isLayerToggle && !isActiveLayer) {
      setSidebarLayer('list');
      ensureSidebarExpanded();
      return;
    }
    setOpen((x) => !x);
  };

  useLayoutEffect(() => {
    if (!open || !isPortaled) {
      setAnchorPos(null);
      return undefined;
    }

    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const measured = popoverRef.current?.getBoundingClientRect();
      const width = measured?.width || LIST_VIEW_POPOVER_WIDTH;
      const height = measured?.height || LIST_VIEW_POPOVER_FALLBACK_HEIGHT;
      const pos = computeRightAnchoredPopoverPosition(
        rect,
        width,
        height,
        PROTO_TOOLBAR_POPOVER_OFFSET,
      );
      setAnchorPos({ top: pos.top, left: pos.left });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, isPortaled]);

  useEffect(() => {
    if (!open) return undefined;

    if (isPortaled) {
      const onPointerDown = (e: MouseEvent) => {
        const target = e.target as Node;
        if (triggerRef.current?.contains(target)) return;
        if (popoverRef.current?.contains(target)) return;
        setOpen(false);
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      document.addEventListener('mousedown', onPointerDown);
      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('mousedown', onPointerDown);
        document.removeEventListener('keydown', onKeyDown);
      };
    }

    const onPointerDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isPortaled]);

  const menuSection = (
    <div className="proto-menu-section" role="group">
      {SIDEBAR_LIST_MODES.map(({ mode, icon, label }) => (
        <button
          key={mode}
          type="button"
          role="menuitemradio"
          aria-checked={sidebarListMode === mode}
          className="proto-menu-item"
          onClick={() => pick(mode)}
        >
          <span className="proto-menu-item__icon" aria-hidden>
            <Icon name={icon} size={PROTO_TOOLBAR_ICON_SIZE} />
          </span>
          <span className="proto-menu-item__label">{label}</span>
        </button>
      ))}
    </div>
  );

  const popoverClassName = [
    'proto-menu__popover',
    'proto-menu__popover--list-view',
    isPortaled
      ? 'proto-menu__popover--sidebar-toolbar proto-menu__popover--sidebar-toolbar-portal'
      : 'proto-menu__popover--sidebar-list-view',
  ]
    .filter(Boolean)
    .join(' ');

  const portaledPopover =
    open && isPortaled && typeof document !== 'undefined'
      ? createPortal(
          <ProtoPopoverShell
            ref={popoverRef}
            className={popoverClassName}
            role="menu"
            aria-label="List view"
            style={{
              top: anchorPos?.top ?? -9999,
              left: anchorPos?.left ?? 0,
            }}
          >
            {menuSection}
          </ProtoPopoverShell>,
          document.body,
        )
      : null;

  return (
    <div
      className={[
        'proto-menu',
        isPortaled ? 'proto-sidebar-toolbar__mode-menu' : 'proto-sidebar-list-view__menu',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={rootRef}
    >
      {isPortaled ? (
        <PrototypeToolbarShortcutItem shortcut="L" showShortcut={showShiftHints}>
          <button
            ref={triggerRef}
            type="button"
            className="proto-toolbar-icon-btn"
            data-active={isActiveLayer}
            aria-expanded={open}
            aria-haspopup="menu"
            title={title}
            aria-label={title}
            disabled={disabled}
            onClick={onTriggerClick}
          >
            <ListModeTriggerIcon mode={sidebarListMode} size={iconSize} />
          </button>
        </PrototypeToolbarShortcutItem>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="proto-sidebar-list-view__trigger"
          aria-expanded={open}
          aria-haspopup="menu"
          title={title}
          disabled={disabled}
          onClick={onTriggerClick}
        >
          <span className="proto-toolbar-folder-chip__icon" aria-hidden>
            <ListModeTriggerIcon mode={sidebarListMode} size={iconSize} />
          </span>
          <span className="proto-sidebar-list-view__label">{listModeShortLabel(sidebarListMode)}</span>
          <span className="proto-sidebar-list-view__chevron" aria-hidden>
            <Icon name="caret-down" size={11} />
          </span>
        </button>
      )}

      {open && !isPortaled ? (
        <ProtoPopoverShell className={popoverClassName} role="menu" aria-label="List view">
          {menuSection}
        </ProtoPopoverShell>
      ) : null}
      {portaledPopover}
    </div>
  );
}
