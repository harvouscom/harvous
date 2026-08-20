/**
 * Detail-column toolbar — mirrors macOS Harvous detail toolbar.
 *
 * Desktop detail:  [show sidebar when collapsed] [space orb when collapsed] [compose] · folder chip · find/share/more · inspector · account
 * Mobile unified: [sidebar toggle] [space orb] [compose] · … (list mode stays in drawer header)
 */
import { useCallback, useEffect, useRef } from 'react';
import { useToolbarAnchoredPopover } from '../../hooks/useToolbarAnchoredPopover';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import SpaceSwitcherMenu from './SpaceSwitcherMenu';
import { useNote } from '../../hooks/queries/useNote';
import { useForeignSharedNote } from '../../hooks/useForeignSharedNote';
import { normalizeNoteIdFromParam, isPrototypeDraftNoteSlug } from './proto-route-slugs';
import {
  resolveVisibleComposeTarget,
  useProtoShell,
  usePrototypeFolderChip,
} from '../../layouts/proto-shell-context';
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
import {
  isPrototypeHomePath,
  isPrototypeNotePath,
  isPrototypeReadPath,
  matchPrototypeNoteId,
  prototypeHomeRouteTo,
  prototypeReadRouteTo,
} from '@/lib/prototype-path';
import { bookSlug } from '@/utils/bible-book-chapters';
import { useSmartJumpDestination } from '../../hooks/useSmartJumpDestination';
import { prototypeToolbarNoteDetailsAvailable } from './prototype-toolbar-note-details';
import {
  canOrganizeSharedSpaceNote,
  canPinSharedSpaceItem,
} from '../../lib/shared-space-capabilities';
import { useNavigationSharedSpaceAccess } from '../../hooks/queries/useNavigation';
import { canComposeInSpace } from '../../lib/shared-space-capabilities';

export type NativeToolbarVariant = 'detail' | 'unified';

function normalizeToolbarSpaceId(spaceId: string | null | undefined): string | null {
  const trimmed = spaceId?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('space_') ? trimmed : `space_${trimmed}`;
}

/**
 * The shared space this note is being read *in*, or null for a plain My Home read.
 *
 * Intersection, never fallback: a space only becomes the note's context when the
 * note actually has a live association with it. Falling back to whatever the
 * switcher held meant opening a My Home note and switching spaces silently
 * re-contexted it — which hid the Share button (shared contexts set canShare
 * false), offered "Remove from this space", and 404'd on organize.
 *
 * Fails closed while `noteSharedSpaceIds` is undefined: callers gate on
 * `contextualAccessKnown` and must not act on an unresolved context.
 */
export function resolveNativeToolbarSharedContextId(options: {
  /** `?space=` when present, else the active space from the switcher. */
  activeSpaceId?: string | null;
  /** `note.spaces[].id`. `undefined` = associations not loaded yet. */
  noteSharedSpaceIds?: string[] | undefined;
  homeSpaceId?: string | null;
}): string | null {
  const active = normalizeToolbarSpaceId(options.activeSpaceId);
  const home = normalizeToolbarSpaceId(options.homeSpaceId);
  /*
   * `!home` matters as much as `active === home`.
   *
   * Home is resolved from navigation, which lands after the first paint. Until it does,
   * `active === home` can never be true — so a My Home note fell through, matched its own
   * space in `note.spaces`, and was reported as a *shared* context. Capabilities then failed
   * closed, and the folder chip and Share button both disappeared for as long as nav took.
   * That is the transient half of "folder info, more options and share don't load".
   *
   * Reading an unknown home as "personal" is the safe direction: a note that really is
   * foreign-shared is caught separately by `readOnlyForeignNote`, which Share is also gated
   * on, so this cannot expose Share on someone else's note.
   */
  if (!active || !home || active === home) return null;
  if (!options.noteSharedSpaceIds) return null;
  const associated = options.noteSharedSpaceIds.some(
    (id) => normalizeToolbarSpaceId(id) === active,
  );
  return associated ? active : null;
}

export function resolveNativeToolbarContextCapabilities(options: {
  hasSharedContext: boolean;
  contextualAccessKnown: boolean;
  isOwnNote: boolean;
  isSpaceOwner: boolean;
}) {
  if (!options.hasSharedContext) {
    return {
      canOrganize: true,
      canPin: true,
      canRemove: false,
      canShare: true,
    };
  }
  if (!options.contextualAccessKnown) {
    return {
      canOrganize: false,
      canPin: false,
      canRemove: false,
      canShare: false,
    };
  }
  return {
    canOrganize: canOrganizeSharedSpaceNote({
      isOwnNote: options.isOwnNote,
      isSpaceOwner: options.isSpaceOwner,
    }),
    canPin: canPinSharedSpaceItem({ isSpaceOwner: options.isSpaceOwner }),
    canRemove: options.isOwnNote || options.isSpaceOwner,
    canShare: false,
  };
}

export default function NativeToolbar({ variant = 'detail' }: { variant?: NativeToolbarVariant }) {
  const navigate = useNavigate();
  // Select primitives only — object literals from `select` cause max-update-depth loops.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const spaceSearchParam = useRouterState({
    select: (s) => {
      const search = s.location.search as Record<string, unknown>;
      if (typeof search.space === 'string' || typeof search.space === 'number') {
        return String(search.space);
      }
      return undefined;
    },
  });
  const contextSpaceId = normalizeToolbarSpaceId(spaceSearchParam) ?? undefined;

  const findButtonRef = useRef<HTMLButtonElement | null>(null);
  const overflowMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  const folderChipRef = useRef<HTMLButtonElement | null>(null);
  const folderPopover = useToolbarAnchoredPopover();
  const findPopover = useToolbarAnchoredPopover();
  const sharePopover = useToolbarAnchoredPopover();
  const { homeSpaceId, authReady } = usePrototypeHomeSpaceId();

  const prototypeFolderChip = usePrototypeFolderChip();
  const {
    composePersistedNoteId,
    composeDraftActive,
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
    closeInspector,
    closeDrawer,
    ensureSidebarExpanded,
    activeSpaceId,
    sidebarLayer,
    sidebarListSpaceScope,
  } = useProtoShell();

  const isUnified = variant === 'unified';
  const noteSlugFromPath = matchPrototypeNoteId(pathname);
  const isDraftNoteRoute =
    composeDraftActive ||
    (noteSlugFromPath != null && isPrototypeDraftNoteSlug(noteSlugFromPath));
  const toolbarNoteId = resolvePrototypeToolbarNoteId(
    composePersistedNoteId,
    noteSlugFromPath,
    isDraftNoteRoute,
    normalizeNoteIdFromParam,
  );
  const isOnNotePage =
    isPrototypeNotePath(pathname) || (composeDraftActive && isPrototypeHomePath(pathname));

  const { data: toolbarNote, isLoading: toolbarNoteLoading } = useNote(
    toolbarNoteId ?? '',
    contextSpaceId,
  );
  const { readOnlyInSharedSpace } = useForeignSharedNote(
    toolbarNoteId,
    contextSpaceId,
  );

  const readOnlyForeignNote = readOnlyInSharedSpace;
  const visibleComposeTarget = resolveVisibleComposeTarget({
    homeSpaceId,
    activeSpaceId,
    sidebarLayer,
    sidebarListSpaceScope,
  });
  const noteSharedSpaceIds = toolbarNote?.spaces?.map((space) => space.id);
  const currentSharedSpaceId = resolveNativeToolbarSharedContextId({
    // `?space=` wins while it's on the URL (deep links, back-nav); otherwise the
    // switcher says where we are. Either way the note's own associations decide
    // whether that space is actually this note's context.
    activeSpaceId: contextSpaceId ?? activeSpaceId,
    noteSharedSpaceIds,
    homeSpaceId,
  });
  const { access: contextualSpaceAccess } = useNavigationSharedSpaceAccess(currentSharedSpaceId);
  const contextualAccessKnown = !currentSharedSpaceId || contextualSpaceAccess !== null;
  const isContextSpaceOwner = contextualSpaceAccess?.isOwner === true;
  const isSharedContext = currentSharedSpaceId !== null;
  const noteSpaceId = currentSharedSpaceId ?? homeSpaceId;
  const sharedSpaceNames = toolbarNote?.spaces?.map((space) => space.title).filter(Boolean) ?? [];
  const canComposeInContext = canComposeInSpace({
    type: contextualSpaceAccess?.space.type,
    orgId: contextualSpaceAccess?.space.orgId,
  });
  // Name the destination up front — "New note" never said where it would land.
  const activeSpaceTitle = contextualSpaceAccess?.space.title?.trim();
  const composeDestinationLabel =
    visibleComposeTarget && visibleComposeTarget !== homeSpaceId && activeSpaceTitle
      ? `New note in ${activeSpaceTitle}`
      : 'New note in My Home';
  const contextualCapabilities = resolveNativeToolbarContextCapabilities({
    hasSharedContext: isSharedContext,
    contextualAccessKnown,
    isOwnNote: !readOnlyForeignNote,
    isSpaceOwner: isContextSpaceOwner,
  });

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
    if (!visibleComposeTarget || !canComposeInContext) return;
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    beginPrototypeComposeSession({ targetSpaceId: visibleComposeTarget });
    navigate({ to: prototypeHomeRouteTo() });
  };

  /*
   * The reader had no permanent door. Every way in was conditional on state a new account does
   * not have yet — a verse of the day that can be dismissed, a reading position that only
   * exists once you have read, a scripture index built from notes you have not written — so
   * someone with an empty account could not reach it at all except by typing the URL.
   */
  const smartJump = useSmartJumpDestination();

  const onOpenReader = useCallback(() => {
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    void navigate({
      to: prototypeReadRouteTo(),
      params: { book: bookSlug(smartJump.book), chapter: String(smartJump.chapter) },
      search: {
        v: smartJump.verse ? String(smartJump.verse) : undefined,
        t: smartJump.translation || undefined,
      },
    });
  }, [smartJump, isMobileSidebar, closeDrawer, navigate]);

  const onSidebarButton = () => {
    if (isMobileSidebar) toggleDrawer();
    else toggleDesktopSidebar();
  };

  const onShowSidebar = () => {
    ensureSidebarExpanded();
  };

  const showShiftHints = usePrototypeShiftHints();

  /**
   * The reader is a document too, so it gets the same details orb in the same slot —
   * a second, differently-placed control for "show me this document's panel" would be
   * two vocabularies for one idea. Its availability is simpler than a note's: a chapter
   * is always loadable, so there is nothing to wait on.
   */
  const isOnReadPage = isPrototypeReadPath(pathname);

  const showNoteDetailsOrb =
    prototypeToolbarNoteDetailsAvailable({
      isOnNotePage,
      toolbarNoteId,
      toolbarNoteLoading,
      hasToolbarNote: !!toolbarNote,
      isDraftNoteRoute,
    }) || isOnReadPage;

  useEffect(() => {
    if (!showNoteDetailsOrb && (inspectorOpen || inspectorExiting)) {
      closeInspector();
    }
  }, [showNoteDetailsOrb, inspectorOpen, inspectorExiting, closeInspector]);

  const openFindPopover = useCallback(() => {
    const anchor = isMobileSidebar ? overflowMenuButtonRef.current : findButtonRef.current;
    findPopover.openFrom(anchor);
  }, [isMobileSidebar, findPopover.openFrom]);

  const openSharePopover = useCallback(() => {
    const anchor = isMobileSidebar ? overflowMenuButtonRef.current : shareButtonRef.current;
    sharePopover.openFrom(anchor);
  }, [isMobileSidebar, sharePopover.openFrom]);

  useEffect(() => {
    if (!contextualCapabilities.canShare && sharePopover.isOpen) {
      sharePopover.dismiss();
    }
  }, [contextualCapabilities.canShare, sharePopover.dismiss, sharePopover.isOpen]);

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
  /** Mobile drawer header owns the space orb while open — avoid twin home orbs. */
  const showToolbarSpaceSwitcher =
    (isUnified || showCollapsedSidebarControls) &&
    !(isMobileSidebar && drawerOpen && !sidebarExiting);

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
        {showToolbarSpaceSwitcher ? (
          <SpaceSwitcherMenu homeSpaceId={homeSpaceId} authReady={authReady} iconOnly />
        ) : null}
        <PrototypeToolbarShortcutItem shortcut="N" showShortcut={showShiftHints}>
          <button
            type="button"
            className="proto-toolbar-icon-btn"
            title={
              canComposeInContext
                ? composeDestinationLabel
                : 'Composing is not available in this channel yet'
            }
            aria-label={canComposeInContext ? composeDestinationLabel : 'New note unavailable'}
            disabled={!homeSpaceId || !canComposeInContext}
            onClick={onCompose}
          >
            <Icon name="pen-to-square" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
          </button>
        </PrototypeToolbarShortcutItem>
        {/* Beside compose, because reading and writing are the two things you start here.
            Unlike compose it needs no space permission — a chapter is not written to. */}
        <PrototypeToolbarShortcutItem shortcut="R" showShortcut={showShiftHints}>
          <button
            type="button"
            className="proto-toolbar-icon-btn"
            title="Read the Bible"
            aria-label="Read the Bible"
            disabled={!homeSpaceId}
            onClick={onOpenReader}
          >
            <Icon name="book-open" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
          </button>
        </PrototypeToolbarShortcutItem>
      </div>

      <div className="proto-toolbar-center">
        {isOnNotePage && !toolbarNoteLoading && toolbarNote && contextualCapabilities.canOrganize ? (
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
                contextSpaceId={contextSpaceId}
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

            {/*
              * Reserve the orb rather than letting it pop in.
              *
              * `useNote` paints instantly from a sessionStorage snapshot, so a note opened
              * in this session looks fine — but a hard refresh onto a note URL, or a tap on
              * a Bible-reader margin bar, has no snapshot, and Share and ⋯ were simply
              * absent for the whole fetch and then appeared, shoving the row. Holding their
              * width keeps the toolbar still while the answer arrives.
              */}
            {isOnNotePage && toolbarNoteId && !isMobileSidebar && toolbarNoteLoading ? (
              <span className="proto-toolbar-icon-btn proto-toolbar-icon-btn--placeholder" aria-hidden />
            ) : null}
            {toolbarNote && toolbarNoteId && !isMobileSidebar && !readOnlyForeignNote && contextualCapabilities.canShare ? (
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
            {sharePopover.isOpen && toolbarNote && toolbarNoteId && contextualCapabilities.canShare ? (
              <PrototypeSharePopover
                noteId={toolbarNoteId}
                isPublic={!!toolbarNote.isPublic}
                shareToken={toolbarNote.shareToken ?? null}
                sharedSpaceNames={sharedSpaceNames}
                anchorRect={sharePopover.anchorRect}
                exiting={sharePopover.exiting}
                onDismiss={sharePopover.dismiss}
              />
            ) : null}

            {/* The menu genuinely cannot render without a space id — every action it offers is
                addressed by one — so hold its place until navigation has produced one. */}
            {!noteSpaceId ? (
              <span className="proto-toolbar-icon-btn proto-toolbar-icon-btn--placeholder" aria-hidden />
            ) : null}
            {noteSpaceId ? (
              <PrototypeNoteMoreMenu
                noteId={toolbarNoteId}
                spaceId={noteSpaceId}
                homeSpaceId={homeSpaceId ?? undefined}
                currentSharedSpaceId={currentSharedSpaceId ?? undefined}
                currentSharedSpaceTitle={
                  toolbarNote?.spaces?.find((space) => space.id === currentSharedSpaceId)?.title ??
                  contextualSpaceAccess?.space.title
                }
                canRemoveFromCurrentSpace={contextualCapabilities.canRemove}
                canPin={contextualCapabilities.canPin}
                noteSpaces={toolbarNote?.spaces}
                isOwnNote={toolbarNote?.isOwnNote !== false}
                contentEncrypted={toolbarNote?.contentEncrypted === true}
                overflowActions={isMobileSidebar}
                isPublic={!!toolbarNote?.isPublic}
                readOnlyForeign={readOnlyForeignNote}
                menuButtonRef={overflowMenuButtonRef}
                onFind={isMobileSidebar && !readOnlyForeignNote ? openFindPopover : undefined}
                onShare={
                  isMobileSidebar && toolbarNote && !readOnlyForeignNote && contextualCapabilities.canShare
                    ? openSharePopover
                    : undefined
                }
              />
            ) : null}
          </div>
        ) : null}

        <div className="proto-toolbar-orb-group proto-toolbar-orb-group--trailing" aria-label="Toolbar">
          {showNoteDetailsOrb ? (
            <PrototypeToolbarShortcutItem shortcut="D" showShortcut={showShiftHints}>
              <button
                type="button"
                className="proto-toolbar-icon-btn"
                data-active={inspectorOpen ? 'true' : 'false'}
                title={
                  isOnReadPage
                    ? inspectorOpen
                      ? 'Hide reading details'
                      : 'Show reading details'
                    : inspectorOpen
                      ? 'Hide note details'
                      : 'Show note details'
                }
                aria-label={
                  isOnReadPage
                    ? inspectorOpen
                      ? 'Hide reading details'
                      : 'Show reading details'
                    : inspectorOpen
                      ? 'Hide note details'
                      : 'Show note details'
                }
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
