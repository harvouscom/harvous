/**
 * List view popover — Notes, Folders, Highlights, Scripture (native SidebarPanelView parity).
 */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useProtoShell, type SidebarListMode } from '../../layouts/proto-shell-context';
import { PROTO_LIST_VIEW_ICON_SIZE, PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';

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
    <div className="proto-menu" ref={rootRef}>
      <button
        type="button"
        className="proto-space-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        title={listModeTitle(sidebarListMode)}
        disabled={disabled}
        onClick={() => !disabled && setOpen((x) => !x)}
      >
        <ListModeTriggerIcon mode={sidebarListMode} size={PROTO_LIST_VIEW_ICON_SIZE} />
      </button>

      {open ? (
        <div className="proto-menu__popover" role="menu" aria-label="List view">
          <div className="proto-menu-section" role="group">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={sidebarListMode === 'notes'}
              className="proto-menu-item"
              onClick={() => pick('notes')}
            >
              <span className="proto-menu-item__check" aria-hidden>
                {sidebarListMode === 'notes' ? '✓' : ''}
              </span>
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="note-sticky" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>Notes</span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={sidebarListMode === 'folders'}
              className="proto-menu-item"
              onClick={() => pick('folders')}
            >
              <span className="proto-menu-item__check" aria-hidden>
                {sidebarListMode === 'folders' ? '✓' : ''}
              </span>
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="folder" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>Folders</span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={sidebarListMode === 'scripture'}
              className="proto-menu-item"
              onClick={() => pick('scripture')}
            >
              <span className="proto-menu-item__check" aria-hidden>
                {sidebarListMode === 'scripture' ? '✓' : ''}
              </span>
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="book" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>Scripture</span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={sidebarListMode === 'highlights'}
              className="proto-menu-item"
              onClick={() => pick('highlights')}
            >
              <span className="proto-menu-item__check" aria-hidden>
                {sidebarListMode === 'highlights' ? '✓' : ''}
              </span>
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="highlighter" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>Highlights</span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={sidebarListMode === 'dictionary'}
              className="proto-menu-item"
              onClick={() => pick('dictionary')}
            >
              <span className="proto-menu-item__check" aria-hidden>
                {sidebarListMode === 'dictionary' ? '✓' : ''}
              </span>
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="book-open" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>Dictionary</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
