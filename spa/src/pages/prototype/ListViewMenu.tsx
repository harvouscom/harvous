/**
 * List view popover — Notes, Folders, Highlights, Scripture (native SidebarPanelView parity).
 * Rendered at the top of `PrototypeSidebar`, above search.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useProtoShell, type SidebarListMode } from '../../layouts/proto-shell-context';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoPopoverShell from './ProtoPopoverShell';

function listModeShortLabel(mode: SidebarListMode): string {
  switch (mode) {
    case 'notes':
      return 'Notes';
    case 'folders':
      return 'Folders';
    case 'highlights':
      return 'Highlights';
    case 'scripture':
      return 'Scripture';
    case 'dictionary':
      return 'Dictionary';
    default:
      return 'List view';
  }
}

function listModeTitle(mode: SidebarListMode): string {
  switch (mode) {
    case 'notes':
      return 'Notes list';
    case 'folders':
      return 'Folders list';
    case 'highlights':
      return 'Highlights list';
    case 'scripture':
      return 'Scripture index';
    case 'dictionary':
      return 'Dictionary';
    default:
      return 'List view';
  }
}

function ListModeTriggerIcon({ mode, size }: { mode: SidebarListMode; size: number }) {
  switch (mode) {
    case 'notes':
      return <Icon name="note-sticky" size={size} />;
    case 'folders':
      return <Icon name="folder" size={size} />;
    case 'highlights':
      return <Icon name="highlighter" size={size} />;
    case 'scripture':
      return <Icon name="book" size={size} />;
    case 'dictionary':
      return <Icon name="book-open" size={size} />;
    default:
      return <Icon name="note-sticky" size={size} />;
  }
}

export default function ListViewMenu({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    sidebarListMode,
    setSidebarListMode,
    setSidebarFolderDrilldown,
    ensureSidebarExpanded,
  } = useProtoShell();

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const pick = (mode: SidebarListMode) => {
    setSidebarFolderDrilldown(undefined);
    setSidebarListMode(mode);
    ensureSidebarExpanded();
    setOpen(false);
  };

  return (
    <div className="proto-menu proto-sidebar-list-view__menu" ref={rootRef}>
      <button
        type="button"
        className="proto-sidebar-list-view__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        title={listModeTitle(sidebarListMode)}
        disabled={disabled}
        onClick={() => !disabled && setOpen((x) => !x)}
      >
        <span className="proto-toolbar-folder-chip__icon" aria-hidden>
          <ListModeTriggerIcon mode={sidebarListMode} size={14} />
        </span>
        <span className="proto-sidebar-list-view__label">
          {listModeShortLabel(sidebarListMode)}
        </span>
        <span className="proto-sidebar-list-view__chevron" aria-hidden>
          <Icon name="chevron-down" size={11} />
        </span>
      </button>

      {open ? (
        <ProtoPopoverShell
          className="proto-menu__popover proto-menu__popover--list-view proto-menu__popover--sidebar-list-view"
          role="menu"
          aria-label="List view"
        >
          <div className="proto-menu-section" role="group">
            {(
              [
                ['notes', 'note-sticky', 'Notes'],
                ['folders', 'folder', 'Folders'],
                ['scripture', 'book', 'Scripture'],
                ['highlights', 'highlighter', 'Highlights'],
                ['dictionary', 'book-open', 'Dictionary'],
              ] as const
            ).map(([mode, icon, label]) => (
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
        </ProtoPopoverShell>
      ) : null}
    </div>
  );
}
