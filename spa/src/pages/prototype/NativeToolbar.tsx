/**
 * NativeToolbar — mirrors the macOS Harvous toolbar layout.
 *
 * Left group:  [sidebar toggle] [space switcher] [list view] [compose]
 * Center:       "Prototype" brand, or folder chip on prototype note routes
 * Right group: [find · share · more] — gap — [inspector toggle · account menu]
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useNote } from '../../hooks/queries/useNote';
import { PROTOTYPE_DRAFT_NOTE_SLUG, normalizeNoteIdFromParam, isPrototypeDraftNoteSlug } from './proto-route-slugs';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { effectiveNoteFolderLabel } from '@/utils/note-folder-display';
import AccountMenu from './AccountMenu';
import ListViewMenu from './ListViewMenu';
import SpaceSwitcherMenu from './SpaceSwitcherMenu';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import PrototypeSharePopover from './PrototypeSharePopover';
import PrototypeFindInNotePopover from './PrototypeFindInNotePopover';
import PrototypeFolderPopover from './PrototypeFolderPopover';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import PrototypeNoteMoreMenu from './PrototypeNoteMoreMenu';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import { isPrototypeNotePath, matchPrototypeNoteId, prototypeNoteRouteTo } from '@/lib/prototype-path';

/* ── NativeToolbar ───────────────────────────────────────────────────────── */
export default function NativeToolbar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Find popover state — anchored to the toolbar find button.
  const findButtonRef = useRef<HTMLButtonElement | null>(null);
  const [findAnchorRect, setFindAnchorRect] = useState<DOMRect | null>(null);
  // Share popover state — anchored to the toolbar share button.
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  const [shareAnchorRect, setShareAnchorRect] = useState<DOMRect | null>(null);
  // Folder popover state — anchored to the toolbar folder chip.
  const folderChipRef = useRef<HTMLButtonElement | null>(null);
  const [folderAnchorRect, setFolderAnchorRect] = useState<DOMRect | null>(null);
  const { homeSpaceId, navReady } = usePrototypeHomeSpaceId();

  const {
    isMobileSidebar,
    drawerOpen,
    toggleDrawer,
    toggleDesktopSidebar,
    desktopSidebarCollapsed,
    inspectorOpen,
    inspectorExiting,
    toggleInspector,
    closeDrawer,
    prototypeFolderChip,
  } = useProtoShell();

  const noteSlugFromPath = matchPrototypeNoteId(pathname);
  const isDraftNoteRoute = noteSlugFromPath != null && isPrototypeDraftNoteSlug(noteSlugFromPath);
  const toolbarNoteId =
    noteSlugFromPath && !isDraftNoteRoute ? normalizeNoteIdFromParam(noteSlugFromPath) : null;

  const { data: toolbarNote, isLoading: toolbarNoteLoading } = useNote(toolbarNoteId ?? '');

  const noteSpaceId = toolbarNote?.spaces?.[0]?.id ?? homeSpaceId;

  const isOnNotePage = isPrototypeNotePath(pathname);

  const useShellFolderChip =
    isOnNotePage &&
    !!toolbarNoteId &&
    prototypeFolderChip != null &&
    prototypeFolderChip.noteId === toolbarNoteId;

  const toolbarFolderLabel = useShellFolderChip
    ? prototypeFolderChip.label
    : toolbarNote
      ? effectiveNoteFolderLabel({
          primaryCollection: toolbarNote.primaryCollection ?? null,
          secondaryCollections: toolbarNote.secondaryCollections ?? [],
        })
      : null;

  const onCompose = () => {
    if (!homeSpaceId) return;
    if (isMobileSidebar) closeDrawer();
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: PROTOTYPE_DRAFT_NOTE_SLUG },
    });
  };

  const onSidebarButton = () => {
    if (isMobileSidebar) toggleDrawer();
    else toggleDesktopSidebar();
  };

  const showShiftHints = usePrototypeShiftHints();

  useEffect(() => {
    if (!isOnNotePage || !toolbarNoteId) return;
    const onOpenFind = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.noteId && String(d.noteId) !== String(toolbarNoteId)) return;
      if (findButtonRef.current) {
        setFindAnchorRect(findButtonRef.current.getBoundingClientRect());
      }
    };
    window.addEventListener('prototypeOpenFindInNote', onOpenFind as EventListener);
    return () => window.removeEventListener('prototypeOpenFindInNote', onOpenFind as EventListener);
  }, [isOnNotePage, toolbarNoteId]);

  return (
    <div className="proto-toolbar-inner">
      {/* Left group */}
      <div className="proto-toolbar-left">
        <PrototypeToolbarShortcutItem shortcut="B" showShortcut={showShiftHints}>
          <button
            type="button"
            className="proto-toolbar-icon-btn"
            onClick={onSidebarButton}
            title={isMobileSidebar ? 'Sidebar' : desktopSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            aria-label={isMobileSidebar ? 'Toggle sidebar drawer' : 'Toggle sidebar visibility'}
          >
            <Icon
              name="bars"
              size={PROTO_TOOLBAR_ICON_SIZE}
              style={{
                transition: 'transform 0.26s cubic-bezier(0.32, 0.72, 0.24, 1)',
                transform: (isMobileSidebar ? !drawerOpen : desktopSidebarCollapsed) ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </PrototypeToolbarShortcutItem>
        <SpaceSwitcherMenu homeSpaceId={homeSpaceId} navReady={navReady} />
        <ListViewMenu disabled={!homeSpaceId} />
        <PrototypeToolbarShortcutItem shortcut="N" showShortcut={showShiftHints}>
          <button
            type="button"
            className="proto-toolbar-icon-btn"
            title="New note"
            aria-label="New note"
            disabled={!homeSpaceId}
            onClick={onCompose}
          >
            <Icon name="pen-to-square" size={PROTO_TOOLBAR_ICON_SIZE} />
          </button>
        </PrototypeToolbarShortcutItem>
      </div>

      {/* Center — folder chip on note routes; empty elsewhere */}
      <div className="proto-toolbar-center">
        {isOnNotePage && !toolbarNoteLoading && toolbarNote ? (
          <>
            <button
              ref={folderChipRef}
              type="button"
              className="proto-toolbar-folder-chip"
              title="Folder — edit folders"
              aria-label={toolbarFolderLabel?.trim() ? `Folder: ${toolbarFolderLabel}` : 'Folder — none set'}
              aria-haspopup="dialog"
              aria-expanded={folderAnchorRect !== null}
              onClick={() => {
                if (folderAnchorRect) {
                  setFolderAnchorRect(null);
                } else if (folderChipRef.current) {
                  setFolderAnchorRect(folderChipRef.current.getBoundingClientRect());
                }
              }}
            >
              <Icon name="folder" size={14} className="proto-toolbar-folder-chip__icon" aria-hidden />
              {toolbarFolderLabel?.trim() ? (
                <span className="proto-toolbar-folder-chip__label">{toolbarFolderLabel}</span>
              ) : null}
            </button>
            {folderAnchorRect && toolbarNoteId ? (
              <PrototypeFolderPopover
                note={toolbarNote}
                anchorRect={folderAnchorRect}
                onDismiss={() => setFolderAnchorRect(null)}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {/* Right — note actions (find/share/more) then trailing chrome (inspector, account) */}
      <div className="proto-toolbar-right">
        {isOnNotePage && toolbarNoteId ? (
          <div className="proto-toolbar-orb-group" aria-label="Note actions">
            <PrototypeToolbarShortcutItem shortcut="F" showShortcut={showShiftHints}>
              <button
                ref={findButtonRef}
                type="button"
                className="proto-toolbar-icon-btn"
                title="Find in note (Shift+F)"
                aria-label="Find in note"
                aria-haspopup="dialog"
                aria-expanded={findAnchorRect !== null}
                onClick={() => {
                  if (findAnchorRect) {
                    setFindAnchorRect(null);
                  } else if (findButtonRef.current) {
                    setFindAnchorRect(findButtonRef.current.getBoundingClientRect());
                  }
                }}
              >
                <Icon name="magnifying-glass" size={PROTO_TOOLBAR_ICON_SIZE} />
              </button>
            </PrototypeToolbarShortcutItem>
            {findAnchorRect ? (
              <PrototypeFindInNotePopover
                noteId={toolbarNoteId}
                anchorRect={findAnchorRect}
                onDismiss={() => setFindAnchorRect(null)}
              />
            ) : null}

            {toolbarNote && toolbarNoteId ? (
              <>
                <button
                  ref={shareButtonRef}
                  type="button"
                  className="proto-toolbar-icon-btn"
                  title={toolbarNote.isPublic ? 'This note has a share link' : 'Share note'}
                  aria-label={toolbarNote.isPublic ? 'Manage share link' : 'Share note'}
                  aria-haspopup="dialog"
                  aria-expanded={shareAnchorRect !== null}
                  onClick={() => {
                    if (shareAnchorRect) {
                      setShareAnchorRect(null);
                    } else if (shareButtonRef.current) {
                      setShareAnchorRect(shareButtonRef.current.getBoundingClientRect());
                    }
                  }}
                >
                  <Icon name="share" size={PROTO_TOOLBAR_ICON_SIZE} />
                  {toolbarNote.isPublic ? (
                    <span className="proto-toolbar-icon-btn__share-dot" aria-hidden />
                  ) : null}
                </button>
                {shareAnchorRect ? (
                  <PrototypeSharePopover
                    noteId={toolbarNoteId}
                    isPublic={!!toolbarNote.isPublic}
                    shareToken={toolbarNote.shareToken ?? null}
                    anchorRect={shareAnchorRect}
                    onDismiss={() => setShareAnchorRect(null)}
                  />
                ) : null}
              </>
            ) : null}

            {noteSpaceId ? (
              <PrototypeNoteMoreMenu noteId={toolbarNoteId} spaceId={noteSpaceId} />
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
                <InspectorToggleIcon open={inspectorOpen && !inspectorExiting} size={PROTO_TOOLBAR_ICON_SIZE} />
              </button>
            </PrototypeToolbarShortcutItem>
          ) : null}

          <AccountMenu iconSize={PROTO_TOOLBAR_ICON_SIZE} />
        </div>
      </div>
    </div>
  );
}

/**
 * Custom `table-columns` glyph whose right column fills in when the inspector is
 * open — mirroring the right panel's open/close state. Geometry matches Font
 * Awesome `table-columns` (viewBox 0 0 512 512): right column spans x 288→448,
 * y 160→416.
 */
function InspectorToggleIcon({ open, size }: { open: boolean; size: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color: 'inherit',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" style={{ display: 'block' }}>
        <path d="M0 96C0 60.7 28.7 32 64 32l384 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zm64 64l0 256 160 0 0-256L64 160zm384 0l-160 0 0 256 160 0 0-256z" />
        {/* Right column fill — overlaps generously into the solid divider (left),
            top/bottom bars, and right frame (all the same color) so no antialiased
            hairline shows around the column. Wipes in from the right edge (scaleX)
            to mirror the panel sliding in / out. */}
        <rect
          x="250"
          y="100"
          width="240"
          height="360"
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'right center',
            transform: open ? 'scaleX(1)' : 'scaleX(0)',
            transition: 'transform 0.26s cubic-bezier(0.32, 0.72, 0.24, 1)',
          }}
        />
      </svg>
    </span>
  );
}
