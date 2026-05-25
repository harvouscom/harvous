/**
 * NativeToolbar — mirrors the macOS Harvous toolbar layout.
 *
 * Left group:  [sidebar toggle] [space switcher] [list view] [compose]
 * Center:       "Prototype" brand, or folder chip on prototype note routes
 * Right group: [inspector toggle] [account button → Clerk UserProfile modal]
 */
import { useRef, useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import {
  getNoteIdFromCreateResponse,
  seedNoteFromCreateResponse,
  useNote,
} from '../../hooks/queries/useNote';
import { alertCreateNoteFailure, useCreateSimpleNote } from '../../hooks/mutations/useCreateSimpleNote';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { effectiveNoteFolderLabel } from '@/utils/note-folder-display';
import ListViewMenu from './ListViewMenu';
import { noteParamSlug, normalizeNoteIdFromParam } from './proto-route-slugs';
import SpaceSwitcherMenu from './SpaceSwitcherMenu';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import PrototypeSharePopover from './PrototypeSharePopover';
import PrototypeFolderPopover from './PrototypeFolderPopover';

/* ── NativeToolbar ───────────────────────────────────────────────────────── */
export default function NativeToolbar() {
  const clerk = useClerk();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Share popover state — anchored to the toolbar share button.
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  const [shareAnchorRect, setShareAnchorRect] = useState<DOMRect | null>(null);
  // Folder popover state — anchored to the toolbar folder chip.
  const folderChipRef = useRef<HTMLButtonElement | null>(null);
  const [folderAnchorRect, setFolderAnchorRect] = useState<DOMRect | null>(null);
  const { homeSpaceId, navReady } = usePrototypeHomeSpaceId();
  const createNote = useCreateSimpleNote();

  const {
    isMobileSidebar,
    toggleDrawer,
    toggleDesktopSidebar,
    desktopSidebarCollapsed,
    inspectorOpen,
    toggleInspector,
    closeDrawer,
    prototypeFolderChip,
  } = useProtoShell();

  const notePageMatch = pathname.match(/^\/prototype\/n\/([^/]+)/);
  const noteSlugFromPath = notePageMatch?.[1];
  const toolbarNoteId =
    noteSlugFromPath ? normalizeNoteIdFromParam(noteSlugFromPath) : null;

  const { data: toolbarNote, isLoading: toolbarNoteLoading } = useNote(toolbarNoteId ?? '');

  const isOnNotePage = !!pathname.match(/^\/prototype\/n\//);

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
    if (!homeSpaceId || createNote.isPending) return;
    createNote.mutate(
      { spaceId: homeSpaceId },
      {
        onSuccess: (res) => {
          const nid = getNoteIdFromCreateResponse(res);
          const note = res?.note;
          if (note && typeof note === 'object' && nid && homeSpaceId) {
            try {
              seedNoteFromCreateResponse(queryClient, note as Record<string, unknown> & { id: string }, homeSpaceId);
            } catch (e) {
              console.error('[NativeToolbar] seedNoteFromCreateResponse:', e);
            }
          }
          if (nid) {
            if (isMobileSidebar) closeDrawer();
            navigate({
              to: '/prototype/n/$noteId',
              params: { noteId: noteParamSlug(nid) },
            });
          } else {
            alert('Create succeeded but response had no note id.');
          }
        },
        onError: (err) => {
          alertCreateNoteFailure(err);
        },
      },
    );
  };

  const onSidebarButton = () => {
    if (isMobileSidebar) toggleDrawer();
    else toggleDesktopSidebar();
  };

  return (
    <div className="proto-toolbar-inner">
      {/* Left group */}
      <div className="proto-toolbar-left">
        <button
          type="button"
          className="proto-toolbar-icon-btn"
          onClick={onSidebarButton}
          title={isMobileSidebar ? 'Sidebar' : desktopSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-label={isMobileSidebar ? 'Toggle sidebar drawer' : 'Toggle sidebar visibility'}
        >
          <Icon name="bars" size={PROTO_TOOLBAR_ICON_SIZE} />
        </button>
        <SpaceSwitcherMenu homeSpaceId={homeSpaceId} navReady={navReady} />
        <ListViewMenu disabled={!homeSpaceId} />
        <button
          type="button"
          className="proto-toolbar-icon-btn"
          title="New note"
          aria-label="New note"
          disabled={!homeSpaceId || createNote.isPending}
          onClick={onCompose}
        >
          <Icon name="pen-to-square" size={PROTO_TOOLBAR_ICON_SIZE} />
        </button>
      </div>

      {/* Center — folder chip on note routes; empty elsewhere */}
      <div className="proto-toolbar-center">
        {isOnNotePage && !toolbarNoteLoading && toolbarNote ? (
          <>
            <button
              ref={folderChipRef}
              type="button"
              className="proto-toolbar-folder-chip"
              title="Folder — edit folders and lock"
              aria-label={`Folder: ${toolbarFolderLabel?.trim() ? toolbarFolderLabel : 'Unsorted'}`}
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
              <span className="proto-toolbar-folder-chip__label">
                {toolbarFolderLabel?.trim() ? toolbarFolderLabel : 'Unsorted'}
              </span>
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

      {/* Right group */}
      <div className="proto-toolbar-right">
        {/* Share button — only on note pages with shareable notes */}
        {isOnNotePage && toolbarNote && !toolbarNote.contentEncrypted ? (
          <>
            <button
              ref={shareButtonRef}
              type="button"
              className="proto-toolbar-icon-btn"
              data-active={toolbarNote.isPublic ? 'true' : 'false'}
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
            </button>
            {shareAnchorRect && toolbarNoteId ? (
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

        {isOnNotePage ? (
          <button
            type="button"
            className="proto-toolbar-icon-btn"
            data-active={inspectorOpen ? 'true' : 'false'}
            title={inspectorOpen ? 'Hide note details' : 'Show note details'}
            aria-label={inspectorOpen ? 'Hide note details' : 'Show note details'}
            onClick={toggleInspector}
          >
            <Icon name="circle-info" size={PROTO_TOOLBAR_ICON_SIZE} />
          </button>
        ) : null}

        <button
          type="button"
          className="proto-toolbar-icon-btn"
          title="Account"
          aria-label="Account"
          onClick={() => clerk.openUserProfile()}
        >
          <Icon name="circle-user" size={PROTO_TOOLBAR_ICON_SIZE} />
        </button>
      </div>
    </div>
  );
}
