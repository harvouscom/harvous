import { useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import ProtoRowSelectCheckbox from '../ProtoRowSelectCheckbox';
import PrototypeSidebarRowMenuPopover from '../PrototypeSidebarRowMenuPopover';
import SharedSpaceNoteAuthorChip from '../SharedSpaceNoteAuthorChip';
import { PROTO_TOOLBAR_ICON_SIZE } from '../proto-toolbar-tokens';
import {
  highlightEntryKindAriaLabel,
  highlightEntryKindIconName,
} from '../proto-highlight-subtitle';
import type { SpaceMemberRow } from '../../../hooks/queries/useSpace';
import { sharedSpaceAuthorChipProps } from './sidebar-row-helpers';

export function HighlightRow({
  isActive,
  isPinned,
  entryKind,
  title,
  rel,
  preview,
  onOpen,
  onTogglePin,
  onDelete,
  isDeleting,
  isScopedSharedSpace = false,
  authorDisplayName,
  authorColor,
  authorUserId,
  isOwnHighlight = true,
  sharedSpaceMemberByUserId,
  selectable = false,
  selectMode = false,
  selected = false,
  onToggleSelected,
  onSelectRangeTo,
}: {
  selectable?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  onSelectRangeTo?: () => void;
  isActive: boolean;
  isPinned: boolean;
  entryKind: string | null | undefined;
  title: string;
  rel?: string;
  preview?: string;
  onOpen: () => void;
  onTogglePin: () => void;
  onDelete: (anchorRect: DOMRect) => void;
  isDeleting: boolean;
  isScopedSharedSpace?: boolean;
  authorDisplayName?: string;
  authorColor?: string;
  authorUserId?: string;
  isOwnHighlight?: boolean;
  sharedSpaceMemberByUserId?: Map<string, SpaceMemberRow>;
}) {
  const kindIcon = highlightEntryKindIconName(entryKind);
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);

  return (
    <li
      ref={rowRef}
      className={[
        'proto-note-row-item',
        selectMode ? 'proto-note-row-item--selectable' : '',
        selected ? 'proto-note-row-item--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-active={selectMode ? (selected ? 'true' : 'false') : isActive ? 'true' : 'false'}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      {/* Sibling of the main button, over the kind icon's own place — see the
          multi-select CSS block for why it is not a child. */}
      {selectable ? (
        <ProtoRowSelectCheckbox
          selected={selected}
          label={title}
          onToggle={() => onToggleSelected?.()}
          onRangeTo={() => onSelectRangeTo?.()}
        />
      ) : null}
      <button
        type="button"
        className="proto-note-row__main"
        onClick={(e) => {
          /* Same bargain as a note row: ⌘ adds, shift takes a range, and once
             something is held a plain click keeps selecting rather than
             navigating away from the set you were building. */
          if (e.metaKey || e.ctrlKey) return onToggleSelected?.();
          if (e.shiftKey && onSelectRangeTo) return onSelectRangeTo();
          if (selectMode) return onToggleSelected?.();
          onOpen();
        }}
        aria-label={`${highlightEntryKindAriaLabel(entryKind)}: ${title}`}
      >
        <div className="proto-note-row__title-line">
          {isPinned ? (
            <span className="proto-note-row__pin" aria-hidden>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
          <span className="proto-note-row__kind-icon" aria-hidden>
            <Icon name={kindIcon} size={11} />
          </span>
          <span className="pds-list-title proto-note-row__title-text">{title}</span>
        </div>
        <div className="pds-list-preview proto-note-row__preview">
          {isScopedSharedSpace && authorDisplayName ? (
            <SharedSpaceNoteAuthorChip
              {...sharedSpaceAuthorChipProps(sharedSpaceMemberByUserId ?? new Map(), {
                userId: authorUserId,
                displayName: authorDisplayName,
                color: authorColor,
                isSelf: isOwnHighlight,
              })}
            />
          ) : null}
          {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
          {rel && preview ? '  ' : null}
          {preview ? <span>{preview}</span> : null}
        </div>
      </button>
      <div
        className={`proto-menu proto-note-row__menu${menuOpen ? ' proto-note-row__menu--open' : ''}`}
        ref={menuRootRef}
      >
        <button
          type="button"
          className="proto-note-row__menu-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Highlight actions"
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
          aria-label="Highlight actions"
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
              <span className="proto-menu-item__label">{isPinned ? 'Unpin highlight' : 'Pin highlight'}</span>
            </button>
            {(!isScopedSharedSpace || isOwnHighlight) ? (
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
              <span className="proto-menu-item__label">Delete highlight</span>
            </button>
            ) : null}
          </div>
        </PrototypeSidebarRowMenuPopover>
      </div>
    </li>
  );
}
