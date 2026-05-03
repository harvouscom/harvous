/**
 * NativeToolbar — mirrors the macOS Harvous toolbar layout.
 *
 * Left group:  [sidebar toggle] [space switcher] [compose]
 * Center:       brand label
 * Right group: [inspector toggle] [profile menu]
 *
 * Profile menu sections (native parity):
 *   1. Name (display only)
 *   2. Settings / Name & color / Manage account on web
 */
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  ArrowSquareOut,
  GearSix,
  List,
  PaintBrush,
  PencilSimple,
  Rectangle,
  UserCircle,
} from '@phosphor-icons/react';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useCreateSimpleNote } from '../../hooks/mutations/useCreateSimpleNote';
import { getNavAvatarInitials } from '@/utils/nav-avatar-initials';
import { useProtoShell } from '../../layouts/proto-shell-context';
import SpaceSwitcherMenu from './SpaceSwitcherMenu';

function noteParamSlug(id: string) {
  return id.startsWith('note_') ? id.slice('note_'.length) : id;
}

function spaceParamSlug(id: string) {
  return id.startsWith('space_') ? id.slice('space_'.length) : id;
}

/* ── Profile menu ────────────────────────────────────────────────────────── */
function ProfileMenu({ initials, displayName, email }: { initials: string; displayName?: string; email?: string }) {
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
        className="proto-avatar-mini"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Profile and settings"
        onClick={() => setOpen((x) => !x)}
      >
        {initials || '•'}
      </button>

      {open ? (
        <div className="proto-menu__popover proto-menu__popover--right" role="menu" aria-label="Profile">
          {/* Display name / email header */}
          {(displayName || email) && (
            <div className="proto-menu-section">
              <div className="proto-menu-muted" style={{ fontWeight: 600, color: 'var(--pds-text-primary)' }}>
                {displayName || email}
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
              <span className="proto-menu-item__icon"><GearSix size={14} /></span>
              Settings
              <span style={{ marginLeft: 'auto' }}><ArrowSquareOut size={11} style={{ opacity: 0.45 }} /></span>
            </Link>
            <Link
              to="/"
              className="proto-menu-item"
              style={{ textDecoration: 'none' }}
              title="Change your display name and theme color in the classic app"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <span className="proto-menu-item__icon"><PaintBrush size={14} /></span>
              Name &amp; color
              <span style={{ marginLeft: 'auto' }}><ArrowSquareOut size={11} style={{ opacity: 0.45 }} /></span>
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
              <span className="proto-menu-item__icon"><UserCircle size={14} /></span>
              Manage account on web
              <span style={{ marginLeft: 'auto' }}><ArrowSquareOut size={11} style={{ opacity: 0.45 }} /></span>
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
  } = useProtoShell();

  const spaceMatch = pathname.match(/^\/prototype\/space\/([^/]+)/);
  const spaceSlug = spaceMatch?.[1];
  const spaceId = spaceSlug ? (spaceSlug.startsWith('space_') ? spaceSlug : `space_${spaceSlug}`) : null;

  const initials = getNavAvatarInitials(user ?? undefined, undefined);
  const displayName = user?.fullName || user?.username || undefined;
  const email = user?.primaryEmailAddress?.emailAddress;

  const isOnNotePage = !!pathname.match(/\/prototype\/space\/[^/]+\/n\//);

  const onCompose = () => {
    if (!spaceId || createNote.isPending) return;
    createNote.mutate(
      { spaceId },
      {
        onSuccess: (res) => {
          const nid = res?.note?.id;
          if (nid) {
            navigate({
              to: '/prototype/space/$spaceId/n/$noteId',
              params: { spaceId: spaceParamSlug(spaceId), noteId: noteParamSlug(nid) },
            });
          }
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
          <List size={17} />
        </button>
        <SpaceSwitcherMenu
          spaces={nav?.spaces ?? []}
          memberOfSpaces={nav?.memberOfSpaces ?? []}
          activeSpaceId={spaceId}
        />
        <button
          type="button"
          className="proto-toolbar-icon-btn"
          title="New note"
          aria-label="New note"
          disabled={!spaceId || createNote.isPending}
          onClick={onCompose}
        >
          <PencilSimple size={17} />
        </button>
      </div>

      {/* Center — brand */}
      <span className="proto-toolbar-brand" aria-hidden>
        Prototype
      </span>

      {/* Right group */}
      <div className="proto-toolbar-right">
        {/* Inspector toggle — active only when viewing a note */}
        <button
          type="button"
          className="proto-toolbar-icon-btn"
          data-active={inspectorOpen && isOnNotePage ? 'true' : 'false'}
          title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          aria-label="Toggle inspector"
          disabled={!isOnNotePage}
          onClick={isOnNotePage ? toggleInspector : undefined}
        >
          <Rectangle size={17} />
        </button>

        <ProfileMenu initials={initials || '•'} displayName={displayName} email={email} />
      </div>
    </div>
  );
}
