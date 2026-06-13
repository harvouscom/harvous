/**
 * Detail-column toolbar — mirrors macOS Harvous detail toolbar.
 *
 * Desktop detail:  [show sidebar when collapsed] [compose] · folder chip · find/share/more · inspector · account
 * Mobile unified: [sidebar toggle] [compose] · … (space + mode live in drawer header)
 */
import { useCallback, useEffect, useRef } from 'react';
import { useToolbarAnchoredPopover } from '../../hooks/useToolbarAnchoredPopover';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useNote } from '../../hooks/queries/useNote';
import { PROTOTYPE_DRAFT_NOTE_SLUG, normalizeNoteIdFromParam, isPrototypeDraftNoteSlug } from './proto-route-slugs';
import { useProtoShell, usePrototypeFolderChip } from '../../layouts/proto-shell-context';
import { resolvePrototypeToolbarNoteId } from '@/utils/prototype-compose-url';
import {
  effectiveNoteFolderLabel,
  noteFolderChipAdditionalCount,
  noteFolderMembershipLabels,
} from '@/utils/note-folder-display';
import AccountMenu from './AccountMenu';
import { PROTO_TOOLBAR_FOLDER_CHIP_ICON_SIZE, PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';
import PrototypeSharePopover from './PrototypeSharePopover';
import PrototypeFindInNotePopover from './PrototypeFindInNotePopover';
import PrototypeFolderPopover from './PrototypeFolderPopover';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import PrototypeNoteMoreMenu from './PrototypeNoteMoreMenu';
import SplitColumnToggleIcon from './SplitColumnToggleIcon';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import { isPrototypeNotePath, matchPrototypeNoteId, prototypeNoteRouteTo } from '@/lib/prototype-path';

export type NativeToolbarVariant = 'detail' | 'unified';

export default function NativeToolbar({ variant = 'detail' }: { variant?: NativeToolbarVariant }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const findButtonRef = useRef<HTMLButtonElement | null>(null);
  const overflowMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  const folderChipRef = useRef<HTMLButtonElement | null>(null);
  const folderPopover = useToolbarAnchoredPopover();
  const findPopover = useToolbarAnchoredPopover();
  const sharePopover = useToolbarAnchoredPopover();
  const { homeSpaceId } = usePrototypeHomeSpaceId();

  const prototypeFolderChip = usePrototypeFolderChip();
  const {
    composePersistedNoteId,
    beginPrototypeComposeSession,
    isMobileSidebar,
    drawerOpen,
    toggleDrawer,
    toggleDesktopSidebar,
    desktopSidebarCollapsed,
    sidebarExiting,
    inspectorOpen,
    inspectorExiting,
    toggleInspector,
    closeDrawer,
    ensureSidebarExpanded,
  } = useProtoShell();

  const isUnified = variant === 'unified';
  const noteSlugFromPath = matchPrototypeNoteId(pathname);
  const isDraftNoteRoute = noteSlugFromPath != null && isPrototypeDraftNoteSlug(noteSlugFromPath);
  const toolbarNoteId = resolvePrototypeToolbarNoteId(
    composePersistedNoteId,
    noteSlugFromPath,
    isDraftNoteRoute,
    normalizeNoteIdFromParam,
  );

  const { data: toolbarNote, isLoading: toolbarNoteLoading } = useNote(toolbarNoteId ?? '');

  const noteSpaceId = toolbarNote?.spaces?.[0]?.id ?? homeSpaceId;

  const isOnNotePage = isPrototypeNotePath(pathname);

  const useShellFolderChip =
    isOnNotePage &&
    !!toolbarNoteId &&
    prototypeFolderChip != null &&
    prototypeFolderChip.noteId === toolbarNoteId;

  const toolbarFolderSource = toolbarNote
    ? {
        primaryCollection: toolbarNote.primaryCollection ?? null,
        secondaryCollections: toolbarNote.secondaryCollections ?? [],
      }
    : null;

  const toolbarFolderLabel = useShellFolderChip
    ? prototypeFolderChip.label
    : toolbarFolderSource
      ? effectiveNoteFolderLabel(toolbarFolderSource)
      : null;

  const toolbarFolderExtraCount = useShellFolderChip
    ? prototypeFolderChip.extraCount
    : toolbarFolderSource
      ? noteFolderChipAdditionalCount(toolbarFolderSource)
      : 0;

  const toolbarFolderAriaLabel = (() => {
    const labels = useShellFolderChip
      ? prototypeFolderChip.membershipLabels
      : toolbarFolderSource
        ? noteFolderMembershipLabels(toolbarFolderSource)
        : [];
    if (labels.length === 0) return 'Folder — none set';
    return `Folders: ${labels.join(', ')}`;
  })();

  const onCompose = () => {
    if (!homeSpaceId) return;
    if (isMobileSidebar) closeDrawer();
    beginPrototypeComposeSession();
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: PROTOTYPE_DRAFT_NOTE_SLUG },
    });
  };

  const onSidebarButton = () => {
    if (isMobileSidebar) toggleDrawer();
    else toggleDesktopSidebar();
  };

  const onShowSidebar = () => {
    ensureSidebarExpanded();
  };

  const showShiftHints = usePrototypeShiftHints();

  const openFindPopover = useCallback(() => {
    const anchor = isMobileSidebar ? overflowMenuButtonRef.current : findButtonRef.current;
    findPopover.openFrom(anchor);
  }, [isMobileSidebar, findPopover.openFrom]);

  const openSharePopover = useCallback(() => {
    const anchor = isMobileSidebar ? overflowMenuButtonRef.current : shareButtonRef.current;
    sharePopover.openFrom(anchor);
  }, [isMobileSidebar, sharePopover.openFrom]);

  useEffect(() => {
    if (!isOnNotePage || !toolbarNoteId) return;
    const onOpenFind = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.noteId && String(d.noteId) !== String(toolbarNoteId)) return;
      openFindPopover();
    };
    window.addEventListener('prototypeOpenFindInNote', onOpenFind as EventListener);
    return () => window.removeEventListener('prototypeOpenFindInNote', onOpenFind as EventListener);
  }, [isOnNotePage, toolbarNoteId, openFindPopover]);

  const showCollapsedSidebarControls =
    !isUnified && (desktopSidebarCollapsed || sidebarExiting);

  return (
    <div className="proto-toolbar-inner">
      <div className="proto-toolbar-left">
        {isUnified ? (
          <PrototypeToolbarShortcutItem shortcut="S" showShortcut={showShiftHints}>
            <button
              type="button"
              className="proto-toolbar-icon-btn"
              onClick={onSidebarButton}
              title="Sidebar"
              aria-label="Toggle sidebar drawer"
            >
              <SplitColumnToggleIcon
                side="left"
                open={drawerOpen && !sidebarExiting}
                size={PROTO_TOOLBAR_ORB_ICON_SIZE}
              />
            </button>
          </PrototypeToolbarShortcutItem>
        ) : null}
        {showCollapsedSidebarControls ? (
          <PrototypeToolbarShortcutItem shortcut="S" showShortcut={showShiftHints}>
            <button
              type="button"
              className="proto-toolbar-icon-btn"
              title="Show sidebar"
              aria-label="Show sidebar"
              onClick={onShowSidebar}
            >
              <SplitColumnToggleIcon side="left" open={false} size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
            </button>
          </PrototypeToolbarShortcutItem>
        ) : null}
        <PrototypeToolbarShortcutItem shortcut="N" showShortcut={showShiftHints}>
          <button
            type="button"
            className="proto-toolbar-icon-btn"
            title="New note"
            aria-label="New note"
            disabled={!homeSpaceId}
            onClick={onCompose}
          >
            <Icon name="pen-to-square" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
          </button>
        </PrototypeToolbarShortcutItem>
      </div>

      <div className="proto-toolbar-center">
        {isOnNotePage && !toolbarNoteLoading && toolbarNote ? (
          <>
            <button
              ref={folderChipRef}
              type="button"
              className="proto-toolbar-folder-chip"
              title="Folder — edit folders"
              aria-label={toolbarFolderAriaLabel}
              aria-haspopup="dialog"
              aria-expanded={folderPopover.isOpen && !folderPopover.exiting}
              onClick={() => folderPopover.toggleFrom(folderChipRef.current)}
            >
              <Icon name="folder" size={PROTO_TOOLBAR_FOLDER_CHIP_ICON_SIZE} className="proto-toolbar-folder-chip__icon" aria-hidden />
              {toolbarFolderLabel?.trim() ? (
                <span className="proto-toolbar-folder-chip__labels">
                  <span className="proto-toolbar-folder-chip__label">{toolbarFolderLabel}</span>
                  {toolbarFolderExtraCount > 0 ? (
                    <span className="proto-toolbar-folder-chip__extra">+{toolbarFolderExtraCount}</span>
                  ) : null}
                </span>
              ) : null}
            </button>
            {folderPopover.isOpen && toolbarNoteId ? (
              <PrototypeFolderPopover
                note={toolbarNote}
                anchorRect={folderPopover.anchorRect}
                exiting={folderPopover.exiting}
                onDismiss={folderPopover.dismiss}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <div className="proto-toolbar-right">
        {isOnNotePage && toolbarNoteId ? (
          <div className="proto-toolbar-orb-group" aria-label="Note actions">
            {!isMobileSidebar ? (
              <PrototypeToolbarShortcutItem shortcut="F" showShortcut={showShiftHints}>
                <button
                  ref={findButtonRef}
                  type="button"
                  className="proto-toolbar-icon-btn"
                  title="Find in note (Shift+F)"
                  aria-label="Find in note"
                  aria-haspopup="dialog"
                  aria-expanded={findPopover.isOpen && !findPopover.exiting}
                  onClick={() => findPopover.toggleFrom(findButtonRef.current)}
                >
                  <Icon name="magnifying-glass" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
                </button>
              </PrototypeToolbarShortcutItem>
            ) : null}
            {findPopover.isOpen ? (
              <PrototypeFindInNotePopover
                noteId={toolbarNoteId}
                anchorRect={findPopover.anchorRect}
                exiting={findPopover.exiting}
                onDismiss={findPopover.dismiss}
              />
            ) : null}

            {toolbarNote && toolbarNoteId && !isMobileSidebar ? (
              <>
                <button
                  ref={shareButtonRef}
                  type="button"
                  className="proto-toolbar-icon-btn"
                  title={toolbarNote.isPublic ? 'This note has a share link' : 'Share note'}
                  aria-label={toolbarNote.isPublic ? 'Manage share link' : 'Share note'}
                  aria-haspopup="dialog"
                  aria-expanded={sharePopover.isOpen && !sharePopover.exiting}
                  onClick={() => sharePopover.toggleFrom(shareButtonRef.current)}
                >
                  <Icon name="share" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
                  {toolbarNote.isPublic ? (
                    <span className="proto-toolbar-icon-btn__share-dot" aria-hidden />
                  ) : null}
                </button>
              </>
            ) : null}
            {sharePopover.isOpen && toolbarNote && toolbarNoteId ? (
              <PrototypeSharePopover
                noteId={toolbarNoteId}
                isPublic={!!toolbarNote.isPublic}
                shareToken={toolbarNote.shareToken ?? null}
                anchorRect={sharePopover.anchorRect}
                exiting={sharePopover.exiting}
                onDismiss={sharePopover.dismiss}
              />
            ) : null}

            {noteSpaceId ? (
              <PrototypeNoteMoreMenu
                noteId={toolbarNoteId}
                spaceId={noteSpaceId}
                overflowActions={isMobileSidebar}
                isPublic={!!toolbarNote?.isPublic}
                menuButtonRef={overflowMenuButtonRef}
                onFind={isMobileSidebar ? openFindPopover : undefined}
                onShare={isMobileSidebar && toolbarNote ? openSharePopover : undefined}
              />
            ) : null}
          </div>
        ) : null}

        <div className="proto-toolbar-orb-group proto-toolbar-orb-group--trailing" aria-label="Toolbar">
          {isOnNotePage ? (
            <PrototypeToolbarShortcutItem shortcut="D" showShortcut={showShiftHints}>
              <button
                type="button"
                className="proto-toolbar-icon-btn"
                data-active={inspectorOpen ? 'true' : 'false'}
                title={inspectorOpen ? 'Hide note details' : 'Show note details'}
                aria-label={inspectorOpen ? 'Hide note details' : 'Show note details'}
                onClick={toggleInspector}
              >
                <SplitColumnToggleIcon
                  side="right"
                  open={inspectorOpen && !inspectorExiting}
                  size={PROTO_TOOLBAR_ORB_ICON_SIZE}
                />
              </button>
            </PrototypeToolbarShortcutItem>
          ) : null}

          <AccountMenu iconSize={PROTO_TOOLBAR_ORB_ICON_SIZE} />
        </div>
      </div>
    </div>
  );
}
