/**
 * Space switcher — Home layer half of the sidebar layer toggle.
 * When the user has a Harvous church (connected or staff bridge), My Home / My Church
 * are a segmented chip toggle; otherwise only My Home appears as a row. Below that:
 * personal Shared Spaces in one list (hosted + joined, drag-reorder preference),
 * or church spaces in My Church mode. "New shared space" gated on the add-on.
 * In My Church, staff can create a church Shared Space or ministry channel.
 * Create opens CreateSharedSpaceSheet (dialog/sheet), not an inline form.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { resolveSpaceSwitcherToolbarState, useActiveSpace } from '../../hooks/useActiveSpace';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import { useSwitchToSpace } from '../../hooks/useSwitchToSpace';
import { useNavigation, type NavSpace } from '../../hooks/queries/useNavigation';
import { useSubscriptionStatus } from '../../hooks/queries/useSubscriptionStatus';
import { useProfile } from '../../hooks/queries/useProfile';
import { useChurchStaffStatus } from '../../hooks/queries/useChurchStaffStatus';
import { isMinistryBroadcastSpace } from '../../lib/shared-space-capabilities';
import {
  canCreateChurchOrgContent,
  churchHubSpacesForOrg,
  isPersonalSharedSpace,
  resolveMyChurchFromNav,
} from '../../lib/church-settings';
import {
  normalizeSharedSpaceSwitcherId,
  orderPersonalSharedSpaces,
} from '../../lib/shared-space-switcher-order';
import { useSharedSpaceSwitcherDragReorder } from '../../hooks/useSharedSpaceSwitcherDragReorder';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import ProtoPopoverShell from './ProtoPopoverShell';
import CreateSharedSpaceSheet, { type CreateSpaceSheetKind } from './CreateSharedSpaceSheet';
import { computeRightAnchoredPopoverPosition } from './proto-popover-position';
import { PROTO_TOOLBAR_ICON_SIZE, PROTO_TOOLBAR_ORB_ICON_SIZE, PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';
import { UNLIMITED, isUnlimited } from '@/lib/shared-spaces-limits';

const SPACE_SWITCHER_POPOVER_WIDTH = 260;
const SPACE_SWITCHER_POPOVER_FALLBACK_HEIGHT = 180;

function normalizeSpaceId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

export default function SpaceSwitcherMenu({
  homeSpaceId,
  authReady,
  iconOnly = false,
}: {
  homeSpaceId: string | null;
  authReady: boolean;
  /** Icon-only orb (detail toolbar when sidebar is collapsed). */
  iconOnly?: boolean;
}) {
  const navigate = useNavigate();
  const {
    sidebarLayer,
    setSidebarLayer,
    activeSpaceId,
    activeChurchOrgId,
    setActiveChurchOrgId,
    ensureSidebarExpanded,
  } = useProtoShell();
  // Switching from the switcher is navigation: it closes an open note the
  // destination space can't hold. Plain setActiveSpaceId stays for silent,
  // non-navigational updates (stale-id repair, cross-space mention handoff).
  const switchToSpace = useSwitchToSpace();
  const { isSharedSpace, space, spaceTitle, navReady } = useActiveSpace();
  const showShiftHints = usePrototypeShiftHints();
  const [open, setOpen] = useState(false);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  /** Captured when opening the create sheet so My Church mode survives menu close. */
  const [createOrgId, setCreateOrgId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<CreateSpaceSheetKind>('shared');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number } | null>(null);
  const { data: nav } = useNavigation();
  const { data: profile } = useProfile();
  const { data: subscription } = useSubscriptionStatus();

  const hasSharedSpaces = Boolean(subscription?.hasSharedSpaces);

  const normalizedActive = useMemo(
    () => (homeSpaceId == null ? null : normalizeSpaceId(homeSpaceId)),
    [homeSpaceId],
  );
  const myChurch = useMemo(
    () =>
      resolveMyChurchFromNav({
        spaces: nav?.spaces,
        memberOfSpaces: nav?.memberOfSpaces,
        connectedOrgId: profile?.connectedOrgId,
        churchName: profile?.churchName,
        churchCity: profile?.churchCity,
        churchState: profile?.churchState,
      }),
    [
      nav?.spaces,
      nav?.memberOfSpaces,
      profile?.connectedOrgId,
      profile?.churchName,
      profile?.churchCity,
      profile?.churchState,
    ],
  );
  const inMyChurchMode = Boolean(activeChurchOrgId);
  /** My Church: that church’s spaces (owned + joined). */
  const churchSpaces = useMemo(() => {
    if (!inMyChurchMode || !activeChurchOrgId) return [] as NavSpace[];
    return churchHubSpacesForOrg(
      [...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])],
      activeChurchOrgId,
    );
  }, [nav?.spaces, nav?.memberOfSpaces, inMyChurchMode, activeChurchOrgId]);

  /** My Home: one list of personal Shared Spaces (hosted + joined), preference-ordered. */
  const personalSharedSpaces = useMemo(() => {
    const byId = new Map<string, NavSpace>();
    for (const s of nav?.spaces ?? []) {
      if (isPersonalSharedSpace(s)) byId.set(normalizeSharedSpaceSwitcherId(s.id), s);
    }
    for (const s of nav?.memberOfSpaces ?? []) {
      if (isPersonalSharedSpace(s)) byId.set(normalizeSharedSpaceSwitcherId(s.id), s);
    }
    return orderPersonalSharedSpaces([...byId.values()], profile?.sharedSpaceSwitcherOrder);
  }, [nav?.spaces, nav?.memberOfSpaces, profile?.sharedSpaceSwitcherOrder]);

  const personalSharedIds = useMemo(
    () => personalSharedSpaces.map((s) => normalizeSharedSpaceSwitcherId(s.id)),
    [personalSharedSpaces],
  );
  const { isStaff: isActiveChurchStaff } = useChurchStaffStatus(
    inMyChurchMode ? activeChurchOrgId : null,
  );
  const canCreateChurchContent = useMemo(
    () =>
      canCreateChurchOrgContent({
        navigation: nav,
        orgId: activeChurchOrgId,
        connectedOrgId: profile?.connectedOrgId,
        isHomeChurchStaff: profile?.isHomeChurchStaff,
        isOrgStaff: isActiveChurchStaff,
      }),
    [
      nav,
      activeChurchOrgId,
      profile?.connectedOrgId,
      profile?.isHomeChurchStaff,
      isActiveChurchStaff,
    ],
  );
  const spaceDrag = useSharedSpaceSwitcherDragReorder({
    orderedSpaceIds: personalSharedIds,
    enabled: !inMyChurchMode && open,
  });
  const personalSpacesById = useMemo(() => {
    const map = new Map<string, NavSpace>();
    for (const s of personalSharedSpaces) {
      map.set(normalizeSharedSpaceSwitcherId(s.id), s);
    }
    return map;
  }, [personalSharedSpaces]);
  const displayedPersonalSpaces = useMemo(() => {
    if (inMyChurchMode) return [];
    return spaceDrag.displayOrderedIds
      .map((id) => personalSpacesById.get(id))
      .filter((s): s is NavSpace => Boolean(s));
  }, [inMyChurchMode, personalSpacesById, spaceDrag.displayOrderedIds]);

  // Plus is unlimited; a stale cache can still report the old numeric limit (or 0),
  // so anything non-positive resolves to unlimited rather than locking the user out.
  const rawOwnedLimit = subscription?.sharedSpacesOwnedLimit;
  const ownedLimit = hasSharedSpaces
    ? typeof rawOwnedLimit === 'number' && rawOwnedLimit > 0
      ? rawOwnedLimit
      : UNLIMITED
    : 0;
  /** Personal Shared Spaces only — church-scoped (orgId) do not burn the add-on quota. */
  const ownedCount = useMemo(
    () => (nav?.spaces ?? []).filter((s) => isPersonalSharedSpace(s)).length,
    [nav?.spaces],
  );
  const atOwnedLimit =
    hasSharedSpaces && !isUnlimited(ownedLimit) && ownedLimit > 0 && ownedCount >= ownedLimit;
  const activeIsMinistry = Boolean(space && isMinistryBroadcastSpace(space));

  useLayoutEffect(() => {
    if (!open) {
      setAnchorPos(null);
      return undefined;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const measured = popoverRef.current?.getBoundingClientRect();
      const width = measured?.width || SPACE_SWITCHER_POPOVER_WIDTH;
      const height = measured?.height || SPACE_SWITCHER_POPOVER_FALLBACK_HEIGHT;
      const pos = computeRightAnchoredPopoverPosition(
        rect,
        width,
        height,
        PROTO_TOOLBAR_POPOVER_OFFSET,
      );
      setAnchorPos({ top: pos.top, left: pos.left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      if (spaceDrag.isDragging) return;
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, spaceDrag.isDragging]);

  if (!authReady) {
    return null;
  }

  const hasHome = Boolean(normalizedActive);
  const { showSharedSpaceToolbar, label: sharedSpaceLabel, triggerTitle } = resolveSpaceSwitcherToolbarState({
    space,
    spaceTitle,
    hasHome,
    navReady,
    myChurchMode: inMyChurchMode,
    myChurchName: myChurch?.churchName ?? null,
  });
  /** Pill when a space/channel is selected (title); My Home / My Church hubs stay circular orbs.
   * `iconOnly` (mobile unified toolbar) forces the plain orb — the name is still reachable
   * from the sidebar/drawer space list, so the toolbar doesn't need to repeat it. */
  const useSpaceSwitcherPill = showSharedSpaceToolbar && !iconOnly;
  // Pill: color tile + title. Hub modes: plain orb glyphs.
  const triggerIcon = activeIsMinistry ? (
    <ProtoSpaceMenuIcon color={space?.color || 'paper'} iconName="rss" />
  ) : showSharedSpaceToolbar ? (
    <ProtoSpaceMenuIcon color={space?.color || 'paper'} />
  ) : inMyChurchMode ? (
    <Icon name="church" size={PROTO_TOOLBAR_ORB_ICON_SIZE} aria-hidden />
  ) : hasHome ? (
    <ProtoHouseIcon size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
  ) : (
    <Icon name="table-cells" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
  );

  function selectHome(options?: { keepOpen?: boolean }) {
    if (!options?.keepOpen) setOpen(false);
    switchToSpace(null);
    ensureSidebarExpanded();
  }

  function selectMyChurch(options?: { keepOpen?: boolean }) {
    if (!myChurch) return;
    if (!options?.keepOpen) setOpen(false);
    setActiveChurchOrgId(myChurch.orgId);
    ensureSidebarExpanded();
  }

  function selectSpace(spaceId: string, options?: { keepChurch?: boolean }) {
    setOpen(false);
    if (!options?.keepChurch) {
      setActiveChurchOrgId(null);
    }
    switchToSpace(normalizeSpaceId(spaceId));
    ensureSidebarExpanded();
  }

  function openCreateSheet(kind: CreateSpaceSheetKind = 'shared') {
    if (!inMyChurchMode) {
      if (atOwnedLimit) return;
      if (!hasSharedSpaces) {
        setOpen(false);
        void navigate({ to: '/upgrade' as any });
        return;
      }
      setCreateOrgId(null);
      setCreateKind('shared');
    } else {
      if (!activeChurchOrgId || !canCreateChurchContent) return;
      setCreateOrgId(activeChurchOrgId);
      setCreateKind(kind);
    }
    setOpen(false);
    setCreateSheetOpen(true);
  }

  function renderSpaceRow(row: NavSpace, options?: { reorderIndex?: number; allowReorder?: boolean }) {
    const checked = activeSpaceId === normalizeSpaceId(row.id);
    // Active space: no new affordance (you're already there). Inactive: subtle dot only.
    const hasUnseen = !checked && Boolean(row.newNoteCount && row.newNoteCount > 0);
    const ministry = isMinistryBroadcastSpace(row);
    const spaceId = normalizeSharedSpaceSwitcherId(row.id);
    const allowReorder = Boolean(options?.allowReorder && spaceDrag.showDragHandle);
    const isDraggingRow = spaceDrag.draggingId === spaceId;
    return (
      <div
        key={row.id}
        className={`proto-space-switcher__row${isDraggingRow ? ' proto-space-switcher__row--dragging' : ''}${
          allowReorder ? ' proto-space-switcher__row--reorderable' : ''
        }`}
        onDragEnter={
          allowReorder && options?.reorderIndex != null
            ? (e) => spaceDrag.handleDragOver(e, options.reorderIndex!)
            : undefined
        }
        onDragOver={
          allowReorder && options?.reorderIndex != null
            ? (e) => spaceDrag.handleDragOver(e, options.reorderIndex!)
            : undefined
        }
        onDrop={allowReorder ? spaceDrag.handleDrop : undefined}
      >
        {allowReorder ? (
          <button
            type="button"
            className="proto-space-switcher__drag-handle"
            draggable
            aria-label={`Reorder ${row.title}`}
            title="Drag to reorder"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              const rowEl = e.currentTarget.closest('.proto-space-switcher__row') as HTMLElement | null;
              spaceDrag.handleDragStart(e, spaceId, rowEl);
            }}
            onDragEnd={spaceDrag.handleDragEnd}
          >
            <Icon name="ellipsis-vertical" size={12} />
          </button>
        ) : null}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={checked}
          className="proto-menu-item proto-space-switcher__row-item"
          title={row.title}
          onClick={() => selectSpace(row.id, { keepChurch: inMyChurchMode })}
        >
          <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
            {ministry ? (
              <ProtoSpaceMenuIcon color={row.color || 'paper'} iconName="rss" />
            ) : (
              <ProtoSpaceMenuIcon color={row.color || 'paper'} />
            )}
            {hasUnseen ? <span className="proto-space-switcher-dot" aria-hidden /> : null}
          </span>
          <span className="proto-menu-item__label">{row.title}</span>
          <span className="proto-menu-item__check" aria-hidden>
            {checked ? <Icon name="check" size={12} /> : null}
          </span>
        </button>
      </div>
    );
  }

  const popover = open && typeof document !== 'undefined'
    ? createPortal(
        <ProtoPopoverShell
          ref={popoverRef}
          className="proto-menu__popover proto-menu__popover--sidebar-toolbar proto-menu__popover--sidebar-toolbar-portal"
          role="menu"
          aria-label="Spaces"
          style={{ top: anchorPos?.top ?? -9999, left: anchorPos?.left ?? 0 }}
        >
          {myChurch ? (
            <div className="proto-menu-section proto-menu-section--mode-toggle" role="group" aria-label="Home or church">
              <div className="proto-space-switcher__mode-toggle" role="radiogroup" aria-label="Home or church">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!inMyChurchMode}
                  className={
                    inMyChurchMode
                      ? 'proto-space-switcher__mode-chip'
                      : 'proto-space-switcher__mode-chip proto-space-switcher__mode-chip--active'
                  }
                  onClick={() => selectHome({ keepOpen: true })}
                >
                  <span className="proto-space-switcher__mode-chip-icon" aria-hidden>
                    <ProtoHouseIcon size={12} />
                  </span>
                  My Home
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={inMyChurchMode}
                  className={
                    inMyChurchMode
                      ? 'proto-space-switcher__mode-chip proto-space-switcher__mode-chip--active'
                      : 'proto-space-switcher__mode-chip'
                  }
                  title={myChurch.churchName}
                  aria-label={`My Church, ${myChurch.churchName}`}
                  onClick={() => selectMyChurch({ keepOpen: true })}
                >
                  <span className="proto-space-switcher__mode-chip-icon" aria-hidden>
                    <Icon name="church" size={12} />
                  </span>
                  My Church
                </button>
              </div>
            </div>
          ) : (
            <div className="proto-menu-section" role="group">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={!isSharedSpace}
                className="proto-menu-item"
                onClick={() => selectHome()}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <ProtoHouseIcon size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">My Home</span>
                <span className="proto-menu-item__check" aria-hidden>
                  {!isSharedSpace ? <Icon name="check" size={12} /> : null}
                </span>
              </button>
            </div>
          )}

          {inMyChurchMode && churchSpaces.length > 0 ? (
            <div className="proto-menu-section" role="group" aria-label="Church spaces">
              {churchSpaces.map((space) => renderSpaceRow(space))}
            </div>
          ) : null}

          {!inMyChurchMode && displayedPersonalSpaces.length > 0 ? (
            <div className="proto-menu-section" role="group" aria-label="Shared spaces">
              {displayedPersonalSpaces.map((space, index) =>
                renderSpaceRow(space, { reorderIndex: index, allowReorder: true }),
              )}
              {spaceDrag.showDragHandle ? (
                <div
                  className="proto-space-switcher__drop-tail"
                  role="presentation"
                  onDragEnter={(e) => spaceDrag.handleDragOver(e, displayedPersonalSpaces.length)}
                  onDragOver={(e) => spaceDrag.handleDragOver(e, displayedPersonalSpaces.length)}
                  onDrop={spaceDrag.handleDrop}
                />
              ) : null}
            </div>
          ) : null}

          {inMyChurchMode && activeChurchOrgId && canCreateChurchContent ? (
            <div className="proto-menu-section" role="group" aria-label="Create church content">
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                onClick={() => openCreateSheet('shared')}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="plus" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">New church shared space</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                onClick={() => openCreateSheet('ministry')}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="plus" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">New ministry channel</span>
              </button>
            </div>
          ) : null}

          {!inMyChurchMode ? (
            <div className="proto-menu-section" role="group">
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                disabled={atOwnedLimit}
                aria-disabled={atOwnedLimit}
                onClick={() => openCreateSheet('shared')}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="plus" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">New shared space</span>
                {!hasSharedSpaces ? (
                  <span className="proto-menu-item__badge">Plus</span>
                ) : null}
              </button>
            </div>
          ) : null}

          {!inMyChurchMode && hasSharedSpaces && atOwnedLimit ? (
            <div className="proto-space-switcher__footer proto-space-switcher__footer--limit" role="status">
              {`You've used all ${ownedLimit} shared spaces you can own.`}
            </div>
          ) : null}
        </ProtoPopoverShell>,
        document.body,
      )
    : null;

  return (
    <div className="proto-menu proto-sidebar-toolbar__mode-menu">
      <PrototypeToolbarShortcutItem shortcut="H" showShortcut={showShiftHints}>
        <button
          ref={triggerRef}
          type="button"
          className={useSpaceSwitcherPill ? 'proto-toolbar-space-switcher' : 'proto-toolbar-icon-btn'}
          data-active={iconOnly ? undefined : sidebarLayer === 'space'}
          title={triggerTitle}
          aria-label={triggerTitle}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={!hasHome}
          onClick={() => {
            if (!hasHome) return;
            if (!open && sidebarLayer !== 'space') {
              // First tap when on the list layer just switches to the space
              // layer (matches the old orb behavior); tap again to open the menu.
              setSidebarLayer('space');
              ensureSidebarExpanded();
              return;
            }
            setOpen((x) => !x);
          }}
        >
          {useSpaceSwitcherPill ? (
            <>
              <span className="proto-toolbar-space-switcher__icon" aria-hidden>
                {triggerIcon}
              </span>
              {sharedSpaceLabel ? (
                <span className="proto-toolbar-space-switcher__label">{sharedSpaceLabel}</span>
              ) : null}
            </>
          ) : (
            triggerIcon
          )}
        </button>
      </PrototypeToolbarShortcutItem>
      {popover}
      <CreateSharedSpaceSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        orgId={createOrgId}
        kind={createKind}
        onCreated={(spaceId) => selectSpace(spaceId, { keepChurch: Boolean(createOrgId) })}
      />
    </div>
  );
}
