/**
 * List view popover — Notes, Folders, Highlights, Scripture (native SidebarPanelView parity).
 * Icon-only trigger lives in the sidebar toolbar cluster (desktop column + mobile drawer header).
 */
import Icon from '@/components/react/Icon';
import { useProtoShell, type SidebarListMode } from '../../layouts/proto-shell-context';
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss';
import { PROTO_TOOLBAR_ICON_SIZE, PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoPopoverShell from './ProtoPopoverShell';

function listModeShortLabel(mode: SidebarListMode): string {
  switch (mode) {
    case 'notes':      return 'Notes';
    case 'folders':    return 'Folders';
    case 'highlights': return 'Highlights';
    case 'scripture':  return 'Scripture';
    case 'threads':    return 'Threads';
    default:           return 'List view';
  }
}

function listModeTitle(mode: SidebarListMode): string {
  switch (mode) {
    case 'notes':      return 'Notes list';
    case 'folders':    return 'Folders list';
    case 'highlights': return 'Highlights list';
    case 'scripture':  return 'Scripture index';
    case 'threads':    return 'Study threads';
    default:           return 'List view';
  }
}

function ListModeTriggerIcon({ mode, size }: { mode: SidebarListMode; size: number }) {
  switch (mode) {
    case 'notes':      return <Icon name="note-sticky" size={size} />;
    case 'folders':    return <Icon name="folder" size={size} />;
    case 'highlights': return <Icon name="highlighter" size={size} />;
    case 'scripture':  return <Icon name="book" size={size} />;
    case 'threads':    return <Icon name="arrow-right-arrow-left" size={size} />;
    default:           return <Icon name="note-sticky" size={size} />;
  }
}

const LIST_MODES = [
  ['notes', 'note-sticky', 'Notes'],
  ['folders', 'folder', 'Folders'],
  ['threads', 'arrow-right-arrow-left', 'Threads'],
  ['highlights', 'highlighter', 'Highlights'],
  ['scripture', 'book', 'Scripture'],
] as const;

export default function ListViewMenu({
  disabled,
  variant = 'icon-only',
}: {
  disabled?: boolean;
  variant?: 'icon-only' | 'full';
}) {
  const { open, setOpen, rootRef } = usePopoverDismiss<HTMLDivElement>();
  const {
    sidebarListMode,
    setSidebarListMode,
    setSidebarFolderDrilldown,
    ensureSidebarExpanded,
  } = useProtoShell();

  const pick = (mode: SidebarListMode) => {
    setSidebarFolderDrilldown(undefined);
    setSidebarListMode(mode);
    ensureSidebarExpanded();
    setOpen(false);
  };

  const title = listModeTitle(sidebarListMode);
  const iconSize = variant === 'icon-only' ? PROTO_TOOLBAR_ORB_ICON_SIZE : 14;

  return (
    <div
      className={[
        'proto-menu',
        variant === 'icon-only' ? 'proto-sidebar-toolbar__mode-menu' : 'proto-sidebar-list-view__menu',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={rootRef}
    >
      <button
        type="button"
        className={
          variant === 'icon-only'
            ? 'proto-toolbar-icon-btn'
            : 'proto-sidebar-list-view__trigger'
        }
        aria-expanded={open}
        aria-haspopup="menu"
        title={title}
        aria-label={variant === 'icon-only' ? title : undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((x) => !x)}
      >
        {variant === 'full' ? (
          <span className="proto-toolbar-folder-chip__icon" aria-hidden>
            <ListModeTriggerIcon mode={sidebarListMode} size={iconSize} />
          </span>
        ) : (
          <ListModeTriggerIcon mode={sidebarListMode} size={iconSize} />
        )}
        {variant === 'full' ? (
          <>
            <span className="proto-sidebar-list-view__label">{listModeShortLabel(sidebarListMode)}</span>
            <span className="proto-sidebar-list-view__chevron" aria-hidden>
              <Icon name="chevron-down" size={11} />
            </span>
          </>
        ) : null}
      </button>

      {open ? (
        <ProtoPopoverShell
          className={[
            'proto-menu__popover',
            'proto-menu__popover--list-view',
            variant === 'icon-only' ? 'proto-menu__popover--sidebar-toolbar' : 'proto-menu__popover--sidebar-list-view',
          ]
            .filter(Boolean)
            .join(' ')}
          role="menu"
          aria-label="List view"
        >
          <div className="proto-menu-section" role="group">
            {LIST_MODES.map(([mode, icon, label]) => (
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
                {sidebarListMode === mode ? (
                  <span className="proto-menu-item__check" aria-hidden>
                    <Icon name="check" size={12} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </ProtoPopoverShell>
      ) : null}
    </div>
  );
}
