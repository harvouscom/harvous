import { useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import ProtoRowSelectCheckbox from '../ProtoRowSelectCheckbox';
import PrototypeSidebarRowMenuPopover from '../PrototypeSidebarRowMenuPopover';
import { PROTO_TOOLBAR_ICON_SIZE } from '../proto-toolbar-tokens';
import type { FolderBucket } from '../sidebar-universal-search';

export function PrototypeSidebarFolderCard({
  folder,
  isPinned,
  onOpen,
  onTogglePin,
  onDelete,
  isDeleting,
  showMenu = true,
  selectable = false,
  selectMode = false,
  selected = false,
  onToggleSelected,
}: {
  folder: FolderBucket;
  isPinned: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  onDelete: (anchorRect: DOMRect) => void;
  isDeleting: boolean;
  showMenu?: boolean;
  /** Named folders only — "Unsorted" is a bucket, not a thing you can act on. */
  selectable?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
}) {
  const isNamed = folder.name !== null;
  const title = folder.name ?? 'Unsorted';
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);

  return (
    <li
      ref={rowRef}
      className={[
        'proto-collection-grid-item',
        selectMode ? 'proto-collection-grid-item--selectable' : '',
        selected ? 'proto-collection-grid-item--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Top-left, mirroring the ⋯ opposite it. A card has no leading glyph to
          hand over and no room to inset, so the checkbox overlays a corner the
          way that menu already does. */}
      {selectable ? (
        <ProtoRowSelectCheckbox
          selected={selected}
          label={title}
          onToggle={onToggleSelected}
          className="proto-collection-card__select"
        />
      ) : null}
      <button
        type="button"
        className="proto-collection-card"
        onClick={(e) => {
          if (selectable && (e.metaKey || e.ctrlKey)) return onToggleSelected?.();
          if (selectMode && selectable) return onToggleSelected?.();
          onOpen();
        }}
        aria-label={`${title}, ${folder.count} notes`}
      >
        <span className="proto-collection-card__icon">
          {isPinned ? (
            <span className="proto-collection-card__pin" aria-hidden>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
          <Icon name="folder" size={13} aria-hidden />
        </span>
        <div className="proto-collection-card__body">
          <div className="proto-collection-card__title">{title}</div>
          <div className="proto-collection-card__count">
            {folder.count} note{folder.count !== 1 ? 's' : ''}
          </div>
        </div>
      </button>
      {isNamed && showMenu ? (
        <div
          className={`proto-menu proto-collection-card__menu${menuOpen ? ' proto-collection-card__menu--open' : ''}`}
          ref={menuRootRef}
        >
          <button
            type="button"
            className="proto-collection-card__menu-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Folder actions"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
          >
            <Icon name="ellipsis-vertical" size={14} />
          </button>
          <PrototypeSidebarRowMenuPopover
            open={menuOpen}
            rowRef={rowRef}
            triggerRootRef={menuRootRef}
            onDismiss={() => setMenuOpen(false)}
            aria-label="Folder actions"
          >
            <div className="proto-menu-section" role="group">
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onTogglePin();
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="thumbtack" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">{isPinned ? 'Unpin folder' : 'Pin folder'}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item proto-menu-item--destructive"
                disabled={isDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(e.currentTarget.getBoundingClientRect());
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">Delete folder</span>
              </button>
            </div>
          </PrototypeSidebarRowMenuPopover>
        </div>
      ) : null}
    </li>
  );
}
