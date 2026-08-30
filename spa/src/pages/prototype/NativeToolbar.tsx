/**
 * Detail-column toolbar — mirrors macOS Harvous detail toolbar.
 *
 * Desktop detail:  [show sidebar when collapsed] [Activity|Note|Read] · library chip · find/share/more · inspector · account
 * Mobile unified: [sidebar toggle] [Activity|Note|Read] · library chip · …
 *
 * The center used to hold a folder chip that appeared only on notes you could organize.
 * It now holds the Library chip, which renders on every mode and opens the browse panel —
 * the surface that took over from the sidebar. See `PrototypeLibraryChip`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToolbarAnchoredPopover } from '../../hooks/useToolbarAnchoredPopover';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import ShellModeSegmented from './ShellModeSegmented';
import { useNote } from '../../hooks/queries/useNote';
import { useForeignSharedNote } from '../../hooks/useForeignSharedNote';
import { normalizeNoteIdFromParam, isPrototypeDraftNoteSlug } from './proto-route-slugs';
import {
  resolveVisibleComposeTarget,
  useProtoShell,
} from '../../layouts/proto-shell-context';
import { resolvePrototypeToolbarNoteId } from '@/utils/prototype-compose-url';
import AccountMenu from './AccountMenu';
import {
  PROTO_SEG_GLYPH_SIZE,
  PROTO_SEG_ICON_SIZE,
  PROTO_TOOLBAR_ORB_ICON_SIZE,
} from './proto-toolbar-tokens';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import ProtoHouseIcon from './ProtoHouseIcon';
import { offerGuestAccount } from '../../lib/guest-gate';
import PrototypeSharePopover from './PrototypeSharePopover';
import PrototypeFindInNotePopover from './PrototypeFindInNotePopover';
import PrototypeLibraryChip from './PrototypeLibraryChip';
import { LIBRARY_CHIP_OPENING_VIEW } from './library-panel/library-panel-view';
import {
  clearLibraryChipRect,
  publishLibraryChipRect,
} from './library-panel/library-chip-rect';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import SpaceSwitcherMenu from './SpaceSwitcherMenu';
import { SpaceSwitcherTriggerIcon } from './SpaceSwitcherTriggerIcon';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import PrototypeNoteMoreMenu from './PrototypeNoteMoreMenu';
import SplitColumnToggleIcon from './SplitColumnToggleIcon';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import {
  isPrototypeAdminPath,
  isPrototypeHomePath,
  isPrototypeNotePath,
  matchPrototypeNoteId,
  prototypeHomeRouteTo,
} from '@/lib/prototype-path';
import { useShellModeNav } from '../../hooks/useShellModeNav';
import { prototypeToolbarNoteDetailsAvailable } from './prototype-toolbar-note-details';
import {
  canOrganizeSharedSpaceNote,
  canPinSharedSpaceItem,
  isMinistryBroadcastSpace,
} from '../../lib/shared-space-capabilities';
import { useNavigationSharedSpaceAccess } from '../../hooks/queries/useNavigation';
import { useSpaceSwitcherUnseen } from './use-space-switcher-unseen';
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
  const findPopover = useToolbarAnchoredPopover();
  const sharePopover = useToolbarAnchoredPopover();
  const { homeSpaceId } = usePrototypeHomeSpaceId();

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
    activeChurchOrgId,
    libraryPanelView,
    libraryPanelExiting,
    openLibraryPanel,
    hideSidebar,
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
  /* The Activity half is the space switcher's trigger here, so the dot that used to live on
     the switcher's own button belongs on it. */
  const unseen = useSpaceSwitcherUnseen({ homeSpaceId, activeSpaceId });

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

  const { isGuest } = useHarvousIdentity();
  const { spaceTitle: activeSpaceTitleForChip, space: activeSpaceRow } = useActiveSpace();
  const activeSpaceColor = activeSpaceRow?.color ?? null;

  /*
   * The space lives on the Activity segment now, not on the centre chip.
   *
   * One tile, one home: the chip names the folder or book you are looking at, and the
   * segment names the space you are in. Both showing the space put the same colour tile
   * and the same word twice in a 46px row.
   */
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);
  const activitySegmentRef = useRef<HTMLButtonElement | null>(null);
  /*
   * The same glyph the sidebar's switcher shows, from the same component — so My Home is a
   * house and My Church is a church, not the generic Activity mark. Only a space with no
   * identity of its own falls back to `layer-group`.
   */
  const spaceGlyph = isGuest ? (
    /*
     * A guest has no space, so this fell through to the neutral `layer-group` the switcher
     * shows while nav is still resolving — a placeholder for an answer that is coming. For a
     * guest no answer is coming, and the honest one is a house: the only space they have is
     * their own, and this segment goes to it.
     */
    <ProtoHouseIcon size={PROTO_SEG_GLYPH_SIZE} />
  ) : homeSpaceId ? (
    <SpaceSwitcherTriggerIcon
      space={activeSpaceRow}
      isMinistry={Boolean(activeSpaceRow && isMinistryBroadcastSpace(activeSpaceRow))}
      inSharedSpace={Boolean(activeSpaceTitleForChip)}
      inMyChurchMode={Boolean(activeChurchOrgId)}
      hasHome={Boolean(homeSpaceId)}
      glyphSize={PROTO_SEG_GLYPH_SIZE}
      tileSize={PROTO_SEG_ICON_SIZE}
    />
  ) : undefined;

  const onCompose = () => {
    /*
     * A guest has no space to compose into, so this used to return silently — a toolbar button
     * that looks live and does nothing, which reads as the app being broken rather than as a
     * feature they have not unlocked. Checked before the target so the two cases stay distinct:
     * below is "the target has not resolved yet", which is a wait, not a wall.
     */
    if (isGuest) {
      offerGuestAccount('Writing notes');
      return;
    }
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
  const { mode, isOnReadPage, hasNoteToResume, openActivity, openNote, openReader } =
    useShellModeNav();

  const onSidebarButton = () => {
    if (isMobileSidebar) toggleDrawer();
    else toggleDesktopSidebar();
  };

  /*
   * Reaching for the "show sidebar" orb is the reader stating a preference, so it goes
   * through the toggle rather than through `ensureSidebarExpanded` — that one exists for the
   * app opening the rail on someone's behalf (a chip, a drilldown), which must not be
   * mistaken for them asking. On mobile there is no preference to record; the drawer is
   * transient by nature.
   */
  const onShowSidebar = () => {
    if (isMobileSidebar) ensureSidebarExpanded();
    else toggleDesktopSidebar();
  };

  const showShiftHints = usePrototypeShiftHints();

  /**
   * The reader is a document too, so it gets the same details orb in the same slot —
   * a second, differently-placed control for "show me this document's panel" would be
   * two vocabularies for one idea. Its availability is simpler than a note's: a chapter
   * is always loadable, so there is nothing to wait on. `isOnReadPage` comes from the
   * same hook that drives the Notes/Bible switch, so the two cannot disagree.
   */
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

  /*
   * There is only one rail left — admin's — so everywhere else the sidebar controls open
   * nothing.
   *
   * Left ungated on a phone, the drawer toggle stayed in the toolbar after the rail was
   * deleted: tapping it set `proto-shell--drawer-open` and mounted the overlay over a drawer
   * with no contents, which is a control that does nothing and a scrim that eats the next tap.
   * The collapsed-rail controls beside it had the same problem on desktop — an expand button
   * for a rail that cannot expand.
   */
  const hasRail = !hideSidebar && isPrototypeAdminPath(pathname);

  const showCollapsedSidebarControls =
    hasRail && !isUnified && (desktopSidebarCollapsed || sidebarExiting);

  return (
    <div className="proto-toolbar-inner">
      <div className="proto-toolbar-left">
        {isUnified && hasRail ? (
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
        {/* The three things you can be doing here, as one control. */}
        <ShellModeSegmented
          mode={mode}
          unseenLabel={unseen.label}
          hasNoteToResume={hasNoteToResume}
          onOpenActivity={openActivity}
          onOpenNote={() => openNote(onCompose)}
          onOpenReader={openReader}
          /*
           * A guest can compose in the sense this flag governs: the half is live, and pressing
           * it explains what writing needs (see `onCompose`). Left false, the label became
           * "Composing is not available in this channel yet" — true of a channel someone lacks
           * permission in, and quite wrong about a visitor who simply has no account yet.
           */
          canCompose={canComposeInContext || isGuest}
          /*
           * `disabled` here means "no home space yet", which for a member is a moment during
           * boot and for a guest is permanent — so this disabled the entire Activity / Note /
           * Bible control for the whole visit. Reading and moving around the app do not need a
           * space; only writing into one does, and that is decided a line above.
           */
          disabled={!homeSpaceId && !isGuest}
          showShortcuts={showShiftHints}
          composeLabel={composeDestinationLabel}
          spaceGlyph={spaceGlyph}
          spaceLabel={activeSpaceTitleForChip ?? (activeChurchOrgId ? 'My Church' : 'My Home')}
          spaceMenuOpen={spaceMenuOpen}
          onOpenSpaceMenu={() => setSpaceMenuOpen((open) => !open)}
          spaceMenuTriggerRef={activitySegmentRef}
        />
        {/* Renders no trigger of its own — the Activity segment above is the button, and
            the seg-track it sits in expects exactly three children. */}
        <SpaceSwitcherMenu
          homeSpaceId={homeSpaceId}
          authReady={!!homeSpaceId}
          trigger="external"
          open={spaceMenuOpen}
          onOpenChange={setSpaceMenuOpen}
          anchorRef={activitySegmentRef}
        />
      </div>

      <div className="proto-toolbar-center">
        <PrototypeLibraryChip
          mode={mode}
          /* Hidden while the panel is *up*, not while it is leaving. The chip has to be
             back on screen during the exit or there is nothing for the shrinking panel to
             dissolve into — it was the second half of the crossfade that never played. */
          panelOpen={Boolean(libraryPanelView) && !libraryPanelExiting}
          onOpen={(rect) => {
            /* Clearing on a failed measure matters as much as publishing on a good one:
               a stale rect from an earlier click would morph this open out of a box the
               chip no longer occupies. */
            if (rect) publishLibraryChipRect(rect);
            else clearLibraryChipRect();
            openLibraryPanel(LIBRARY_CHIP_OPENING_VIEW);
          }}
        />
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
