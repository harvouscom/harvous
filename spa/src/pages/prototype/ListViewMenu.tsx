/**
 * List view popover — Notes vs Folders, same trigger chrome as SpaceSwitcherMenu.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useProtoShell, type SidebarListMode } from '../../layouts/proto-shell-context';
import { PROTO_LIST_VIEW_ICON_SIZE, PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';

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
        title={sidebarListMode === 'notes' ? 'Notes list' : 'Folders list'}
        disabled={disabled}
        onClick={() => !disabled && setOpen((x) => !x)}
      >
        {sidebarListMode === 'notes' ? (
          <Icon name="note-sticky" size={PROTO_LIST_VIEW_ICON_SIZE} />
        ) : (
          <Icon name="folder" size={PROTO_LIST_VIEW_ICON_SIZE} />
        )}
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
