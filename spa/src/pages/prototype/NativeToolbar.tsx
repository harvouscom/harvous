/**
 * NativeToolbar — mirrors the macOS Harvous toolbar layout.
 *
 * Left group:  [sidebar toggle] [space switcher] [list view] [compose]
 * Center:       "Prototype" brand, or folder chip on prototype note routes
 * Right group: [inspector toggle] [profile menu]
 *
 * Profile menu sections (native parity):
 *   1. Name (display only)
 *   2. Settings / Name & color / Manage account on web
 */
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { useNavigation } from '../../hooks/queries/useNavigation';
import {
  getNoteIdFromCreateResponse,
  seedNoteFromCreateResponse,
  useNote,
} from '../../hooks/queries/useNote';
import { alertCreateNoteFailure, useCreateSimpleNote } from '../../hooks/mutations/useCreateSimpleNote';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { effectiveNoteFolderLabel } from '@/utils/note-folder-display';
import ListViewMenu from './ListViewMenu';
import {
  noteParamSlug,
  normalizeNoteIdFromParam,
  spaceParamSlug,
} from './proto-route-slugs';
import SpaceSwitcherMenu from './SpaceSwitcherMenu';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';

/** Profile header: "First L." instead of full last name (matches native-style compact name). */
function firstNameAndLastInitial(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? displayName;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const initial = last[0] ? last[0].toUpperCase() : '';
  return initial ? `${first} ${initial}.` : first;
}

/* ── Profile menu ────────────────────────────────────────────────────────── */
function ProfileMenu({ displayName, email }: { displayName?: string; email?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="proto-menu" ref={rootRef}>
      <button
        type="button"
        className="proto-toolbar-icon-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Profile and settings"
        aria-label="Profile and settings"
        onClick={() => setOpen((x) => !x)}
      >
        <Icon name="user" size={PROTO_TOOLBAR_ICON_SIZE} />
      </button>

      {open ? (
        <div className="proto-menu__popover proto-menu__popover--right" role="menu" aria-label="Profile">
          {/* Display name / email header */}
          {(displayName || email) && (
            <div className="proto-menu-section">
              <div className="proto-menu-muted" style={{ fontWeight: 600, color: 'var(--pds-text-primary)' }}>
                {displayName ? firstNameAndLastInitial(displayName) : email}
              </div>
              {displayName && email && (
                <div className="proto-menu-muted" style={{ paddingTop: 0 }}>{email}</div>
              )}
            </div>
          )}

          {/* Settings actions */}
          <div className="proto-menu-section" role="group">
            <Link
              to="/"
              className="proto-menu-item"
              style={{ textDecoration: 'none' }}
              title="Open Settings in the classic app"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span className="proto-menu-item__icon"><Icon name="gear" size={14} /></span>
              Settings
              <span style={{ marginLeft: 'auto' }}><Icon name="arrow-up-right-from-square" size={11} style={{ opacity: 0.45 }} /></span>
            </Link>
            <Link
              to="/"
              className="proto-menu-item"
              style={{ textDecoration: 'none' }}
              title="Change your display name and theme color in the classic app"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span className="proto-menu-item__icon"><Icon name="paintbrush" size={14} /></span>
              Name &amp; color
              <span style={{ marginLeft: 'auto' }}><Icon name="arrow-up-right-from-square" size={11} style={{ opacity: 0.45 }} /></span>
            </Link>
          </div>

          {/* Account management */}
          <div className="proto-menu-section" role="group">
            <a
              href="https://accounts.clerk.dev/user"
              target="_blank"
              rel="noopener noreferrer"
              className="proto-menu-item"
              style={{ textDecoration: 'none' }}
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span className="proto-menu-item__icon"><Icon name="circle-user" size={14} /></span>
              Manage account on web
              <span style={{ marginLeft: 'auto' }}><Icon name="arrow-up-right-from-square" size={11} style={{ opacity: 0.45 }} /></span>
            </a>
          </div>

          {/* Classic app divider */}
          <div className="proto-menu-section" role="group">
            <Link
              to="/"
              className="proto-menu-item"
              style={{ textDecoration: 'none' }}
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              Classic Harvous app →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── NativeToolbar ───────────────────────────────────────────────────────── */
export default function NativeToolbar() {
  const { user } = useUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: nav } = useNavigation();
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

  const spaceMatch = pathname.match(/^\/prototype\/space\/([^/]+)/);
  const spaceSlug = spaceMatch?.[1];
  const spaceId = spaceSlug ? (spaceSlug.startsWith('space_') ? spaceSlug : `space_${spaceSlug}`) : null;

  const notePageMatch = pathname.match(/^\/prototype\/space\/[^/]+\/n\/([^/]+)/);
  const noteSlugFromPath = notePageMatch?.[1];
  const toolbarNoteId =
    noteSlugFromPath ? normalizeNoteIdFromParam(noteSlugFromPath) : null;

  const { data: toolbarNote, isLoading: toolbarNoteLoading } = useNote(toolbarNoteId ?? '');

  const displayName = user?.fullName || user?.username || undefined;
  const email = user?.primaryEmailAddress?.emailAddress;

  const isOnNotePage = !!pathname.match(/\/prototype\/space\/[^/]+\/n\//);

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
    if (!spaceId || createNote.isPending) return;
    createNote.mutate(
      { spaceId },
      {
        onSuccess: (res) => {
          const nid = getNoteIdFromCreateResponse(res);
          const note = res?.note;
          if (note && typeof note === 'object' && nid && spaceId) {
            try {
              seedNoteFromCreateResponse(queryClient, note as Record<string, unknown> & { id: string }, spaceId);
            } catch (e) {
              console.error('[NativeToolbar] seedNoteFromCreateResponse:', e);
            }
          }
          if (nid) {
            if (isMobileSidebar) closeDrawer();
            navigate({
              to: '/prototype/space/$spaceId/n/$noteId',
              params: { spaceId: spaceParamSlug(spaceId), noteId: noteParamSlug(nid) },
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
        <SpaceSwitcherMenu
          spaces={nav?.spaces ?? []}
          memberOfSpaces={nav?.memberOfSpaces ?? []}
          activeSpaceId={spaceId}
        />
        <ListViewMenu disabled={!spaceId} />
        <button
          type="button"
          className="proto-toolbar-icon-btn"
          title="New note"
          aria-label="New note"
          disabled={!spaceId || createNote.isPending}
          onClick={onCompose}
        >
          <Icon name="pen-to-square" size={PROTO_TOOLBAR_ICON_SIZE} />
        </button>
      </div>

      {/* Center — folder chip on note routes; brand elsewhere */}
      <div className="proto-toolbar-center">
        {isOnNotePage ? (
          toolbarNoteLoading || !toolbarNote ? (
            <span className="proto-toolbar-brand proto-toolbar-brand--muted" aria-hidden>
              Prototype
            </span>
          ) : (
            <button
              type="button"
              className="proto-toolbar-folder-chip"
              title="Folder — open note details"
              aria-label={`Folder: ${toolbarFolderLabel?.trim() ? toolbarFolderLabel : 'No folder'}`}
              onClick={toggleInspector}
            >
              <Icon name="folder" size={14} className="proto-toolbar-folder-chip__icon" aria-hidden />
              <span className="proto-toolbar-folder-chip__label">
                {toolbarFolderLabel?.trim() ? toolbarFolderLabel : 'No folder'}
              </span>
            </button>
          )
        ) : (
          <span className="proto-toolbar-brand" aria-hidden>
            Prototype
          </span>
        )}
      </div>

      {/* Right group */}
      <div className="proto-toolbar-right">
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

        <ProfileMenu displayName={displayName} email={email} />
      </div>
    </div>
  );
}
