import { useRef, useState } from 'react';
import Icon from '@/components/react/Icon';
import ProtoRowSelectCheckbox from '../ProtoRowSelectCheckbox';
import PrototypeSidebarRowMenuPopover from '../PrototypeSidebarRowMenuPopover';
import { PROTO_TOOLBAR_ICON_SIZE } from '../proto-toolbar-tokens';
import { sharedThreadNoteCountPreview } from '../shared-space-dashboard';
import type { SpaceGroupStudyThread } from '../../../hooks/queries/useSpaceGroupThreads';
import type { StudyThreadCluster } from '../../../hooks/queries/usePrototypeStudyThreads';

export function PrototypeSidebarThreadCard({
  cluster,
  title,
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
  cluster: StudyThreadCluster;
  title: string;
  isPinned: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  onDelete: (anchorRect: DOMRect) => void;
  isDeleting: boolean;
  showMenu?: boolean;
  selectable?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const preview = `${cluster.noteCount} note${cluster.noteCount !== 1 ? 's' : ''}`;

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
        aria-label={`${title}, ${preview}`}
      >
        <span className="proto-collection-card__icon">
          {isPinned ? (
            <span className="proto-collection-card__pin" aria-hidden>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
          <Icon name="arrow-right-arrow-left" size={13} aria-hidden />
        </span>
        <div className="proto-collection-card__body">
          <div className="proto-collection-card__title">{title}</div>
          <div className="proto-collection-card__count">{preview}</div>
        </div>
      </button>
      {showMenu ? <div
        className={`proto-menu proto-collection-card__menu${menuOpen ? ' proto-collection-card__menu--open' : ''}`}
        ref={menuRootRef}
      >
        <button
          type="button"
          className="proto-collection-card__menu-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Thread actions"
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
          aria-label="Thread actions"
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
              <span className="proto-menu-item__label">{isPinned ? 'Unpin Thread' : 'Pin Thread'}</span>
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
              <span className="proto-menu-item__label">Delete thread</span>
            </button>
          </div>
        </PrototypeSidebarRowMenuPopover>
      </div> : null}
    </li>
  );
}

export function PrototypeSidebarSharedThreadCard({
  thread,
  onOpen,
  onSetCurrent,
  onDelete,
  isDeleting,
  setCurrentPending,
  showMenu = true,
}: {
  thread: SpaceGroupStudyThread;
  onOpen: () => void;
  onSetCurrent: () => void;
  onDelete: (anchorRect: DOMRect) => void;
  isDeleting: boolean;
  setCurrentPending: boolean;
  showMenu?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const preview = sharedThreadNoteCountPreview(thread.noteCount);

  return (
    <li ref={rowRef} className="proto-collection-grid-item">
      <button
        type="button"
        className="proto-collection-card"
        onClick={onOpen}
        aria-label={`${thread.title}, ${preview}${thread.isPinned ? ', current' : ''}`}
      >
        <span className="proto-collection-card__icon">
          {thread.isPinned ? (
            <span className="proto-collection-card__pin" aria-hidden>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
          <Icon name="arrow-right-arrow-left" size={13} aria-hidden />
        </span>
        <div className="proto-collection-card__body">
          <div className="proto-collection-card__title">{thread.title}</div>
          <div className="proto-collection-card__count">{preview}</div>
        </div>
      </button>
      {showMenu ? (
        <div
          className={`proto-menu proto-collection-card__menu${menuOpen ? ' proto-collection-card__menu--open' : ''}`}
          ref={menuRootRef}
        >
          <button
            type="button"
            className="proto-collection-card__menu-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Thread actions"
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
            aria-label="Thread actions"
          >
            <div className="proto-menu-section" role="group">
              {!thread.isPinned ? (
                <button
                  type="button"
                  role="menuitem"
                  className="proto-menu-item"
                  disabled={setCurrentPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onSetCurrent();
                  }}
                >
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name="thumbtack" size={PROTO_TOOLBAR_ICON_SIZE} />
                  </span>
                  <span className="proto-menu-item__label">Set current</span>
                </button>
              ) : null}
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
                <span className="proto-menu-item__label">Delete thread</span>
              </button>
            </div>
          </PrototypeSidebarRowMenuPopover>
        </div>
      ) : null}
    </li>
  );
}
