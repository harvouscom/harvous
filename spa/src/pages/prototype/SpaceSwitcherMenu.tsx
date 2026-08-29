/**
 * Space switcher — Home layer half of the sidebar layer toggle.
 * When the user has a Harvous church (connected or staff bridge), My Home / My Church
 * are a segmented chip toggle; otherwise only My Home appears as a row. Below that:
 * personal Shared Spaces in one list (hosted + joined, drag-reorder preference),
 * or church spaces in My Church mode. "New shared space" gated on the add-on.
 * In My Church, staff can create a church Shared Space or ministry channel.
 * Create opens CreateSharedSpaceSheet (dialog/sheet), not an inline form.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { SpaceSwitcherTriggerIcon } from './SpaceSwitcherTriggerIcon';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { parentForSpace } from '../../layouts/proto-location';
import { resolveSpaceSwitcherToolbarState, useActiveSpace } from '../../hooks/useActiveSpace';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import { useSwitchToSpace } from '../../hooks/useSwitchToSpace';
import {
  recallShelfHasUnseen,
  subscribeRecallShelfSeenChanged,
} from './proto-recall-seen';
import { localDayIndex } from '@/utils/local-day-index';
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
  orderSwitcherSpaces,
} from '../../lib/shared-space-switcher-order';
import { useSharedSpaceSwitcherDragReorder } from '../../hooks/useSharedSpaceSwitcherDragReorder';
import { marqueeCharCount, marqueePace } from './PrototypeHomeRow';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { verticalDragTransform } from '../../lib/sortable-vertical-transform';
import PrototypeToolbarShortcutItem from './PrototypeToolbarShortcutItem';
import ProtoPopoverShell from './ProtoPopoverShell';
import CreateSharedSpaceSheet, { type CreateSpaceSheetKind } from './CreateSharedSpaceSheet';
import { computeRightAnchoredPopoverPosition } from './proto-popover-position';
import { PROTO_MENU_CHECK_ICON_SIZE, PROTO_SEG_GLYPH_SIZE, PROTO_TOOLBAR_ICON_SIZE, PROTO_TOOLBAR_ORB_ICON_SIZE, PROTO_TOOLBAR_POPOVER_OFFSET } from './proto-toolbar-tokens';
import { UNLIMITED, isUnlimited } from '@/lib/shared-spaces-limits';
import {
  anySpaceHasUnseenActivity,
  normalizeSwitcherSpaceId as normalizeSpaceId,
  spaceHasUnseenActivity,
  unseenDotLabelSuffix,
} from './space-switcher-unseen';

type SpaceSwitcherDragController = ReturnType<typeof useSharedSpaceSwitcherDragReorder>;

/**
 * One space row, always sortable.
 *
 * A component rather than a render function because `useSortable` is a hook — calling it
 * from inside a loop in the parent would change the parent's hook count with the number
 * of spaces.
 *
 * The listeners sit on the ROW, not the handle, because touch has no hover and therefore
 * no handle to press: the gesture has to start from the row itself. The sensors keep the
 * two intents apart — a mouse click with no movement still selects the space, a 6px drag
 * reorders, and on touch a tap selects while a 200ms hold lifts. The handle stays as the
 * visual cue that a row can be moved, and as the keyboard activator.
 */
function SpaceSwitcherRow({
  row,
  nested,
  isDragging,
  checked,
  onSelect,
}: {
  row: NavSpace;
  nested: boolean;
  isDragging: boolean;
  checked: boolean;
  onSelect: (row: NavSpace) => void;
}) {
  const spaceId = normalizeSharedSpaceSwitcherId(row.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: spaceId });
  const hasUnseen = spaceHasUnseenActivity(row, checked);
  const ministry = isMinistryBroadcastSpace(row);

  return (
    <div
      ref={setNodeRef}
      className={`proto-space-switcher__row proto-space-switcher__row--reorderable${
        isDragging ? ' proto-space-switcher__row--dragging' : ''
      }${nested ? ' proto-space-switcher__row--nested' : ''}`}
      style={{ transform: verticalDragTransform(transform), transition }}
      {...listeners}
    >
      <button
        type="button"
        role="menuitemradio"
        aria-checked={checked}
        className="proto-menu-item proto-space-switcher__row-item"
        title={row.title}
        onClick={() => onSelect(row)}
      >
        <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
          {ministry ? (
            <ProtoSpaceMenuIcon color={row.color || 'paper'} iconName="rss" />
          ) : (
            <ProtoSpaceMenuIcon color={row.color || 'paper'} />
          )}
          {hasUnseen ? <span className="proto-space-switcher-dot" aria-hidden /> : null}
        </span>
        <span
          className="proto-menu-item__label proto-marquee"
          title={row.title}
          /* Opt into the edge fade with a real measurement. Without this the count falls back
             to the pacing default and every label fades on hover, however short. */
          style={marqueePace(marqueeCharCount(row.title))}
        >
          <span>{row.title}</span>
        </span>
        <span className="proto-menu-item__check" aria-hidden>
          {checked ? <Icon name="check" size={PROTO_MENU_CHECK_ICON_SIZE} /> : null}
        </span>
      </button>
      {/* Trailing, in flow — the same place and the same grip the thread trail reorders by.
          It used to sit absolutely positioned over the row's left edge, on top of the space
          icon, so the one list in the app you reorder from the left was this one.

          `attributes` (role, tabIndex, aria-describedby) live here so a screen reader gets the
          drag instructions on something focusable, while the pointer gesture stays on the row. */}
      <span
        ref={setActivatorNodeRef}
        className="proto-space-switcher__drag-handle"
        aria-label={`Reorder ${row.title}`}
        title="Drag to reorder"
        {...attributes}
      >
        <Icon name="bars" size={12} />
      </span>
    </div>
  );
}

const SPACE_SWITCHER_POPOVER_WIDTH = 260;
const SPACE_SWITCHER_POPOVER_FALLBACK_HEIGHT = 180;
/** Spaces listed under each parent before collapsing into a "See all" row. */
const SWITCHER_SPACES_PER_PARENT = 6;

const NOOP = () => {};

/**
 * Which triggers live inside the sidebar, and so should reveal it when a space is picked.
 *
 * `ensureSidebarExpanded` was right when this control only ever lived in the rail's own
 * header — picking a space meant "show me it", and the rail was where it would be shown.
 * Mounted anywhere else, that same call slides the sidebar open underneath the surface the
 * reader is actually using.
 */
const REVEALS_SIDEBAR: Record<'orb' | 'segment' | 'panel-header' | 'external', boolean> = {
  orb: true,
  segment: true,
  'panel-header': false,
  external: false,
};

export default function SpaceSwitcherMenu({
  homeSpaceId,
  authReady,
  trigger = 'orb',
  open: openProp,
  onOpenChange,
  anchorRef,
}: {
  homeSpaceId: string | null;
  authReady: boolean;
  /**
   * `orb` is the standalone control — a circle, or a titled pill once a space is chosen.
   * `segment` is the same control as the Spaces half of the sidebar's layer switch: a
   * flat, full-width half of a joined pill. `panel-header` is the Library panel's scope
   * control. Only the trigger changes; the menu below is one menu, because there is only
   * one set of spaces to pick from.
   */
  trigger?: 'orb' | 'segment' | 'panel-header' | 'external';
  /**
   * `external` only: the caller renders the button and owns the open state.
   *
   * Controlled rather than a `renderTrigger` callback, because the one caller puts its
   * trigger inside `.proto-seg-track` — a container whose sliding thumb is sized
   * `track / count` and assumes exactly three equal children. A render prop would still
   * have this component own a DOM node in that track (the `.proto-menu` wrapper it emits),
   * which the thumb does not expect. This way the toolbar's markup stays byte-identical
   * and the menu contributes only its portalled popover.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const navigate = useNavigate();
  const {
    sidebarLayer,
    setSidebarLayer,
    // Named `protoLocation`, not `location` — a bare `location` silently
    // resolves to `window.location` and the shadowing typechecks far enough to
    // hide the mistake.
    location: protoLocation,
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
  /* Declared here rather than beside `inPanelHeader` below, because the open state
     immediately under it branches on this. */
  const isExternal = trigger === 'external';
  const [internalOpen, setInternalOpen] = useState(false);
  /* External mode hands both the button and the open state to the caller. */
  const open = isExternal ? Boolean(openProp) : internalOpen;
  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolve = (prev: boolean) => (typeof next === 'function' ? next(prev) : next);
      if (isExternal) {
        onOpenChange?.(resolve(Boolean(openProp)));
        return;
      }
      setInternalOpen(resolve);
    },
    [isExternal, onOpenChange, openProp],
  );
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

  /**
   * Mark the way back to Home when today's suggestions have not been looked at.
   *
   * Only while you are somewhere else — on the Home layer the shelf is right there, and a dot
   * pointing at what you are already reading is noise. Re-read on the seen-changed event so it
   * clears the moment the shelf renders rather than on the next navigation.
   */
  const [seenTick, setSeenTick] = useState(0);
  useEffect(() => subscribeRecallShelfSeenChanged(() => setSeenTick((t) => t + 1)), []);
  /*
   * "You are not looking at the shelf right now" — asked of whichever surface this trigger
   * lives on. Inside the rail that is the layer; outside it the layer is a question the
   * trigger cannot answer, and asking it anyway made the dot depend on state the toolbar
   * has no relationship to.
   */
  const awayFromShelf = REVEALS_SIDEBAR[trigger] ? sidebarLayer !== 'space' : true;
  const hasUnseenSuggestions = useMemo(
    () => awayFromShelf && recallShelfHasUnseen(homeSpaceId, localDayIndex(new Date())),
    // `seenTick` is the subscription; the day is read fresh each time it fires.
    [awayFromShelf, homeSpaceId, seenTick],
  );

  /*
   * The trigger's other source of news. It used to raise the dot for unseen *suggestions*
   * alone, so the toolbar could sit undotted above a list where two spaces each carried one.
   * Same rule as the rows, asked of all of them at once.
   */
  const spacesHaveUnseen = useMemo(
    () =>
      anySpaceHasUnseenActivity(
        [...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])],
        (row) => activeSpaceId === normalizeSpaceId(row.id),
      ),
    [nav?.spaces, nav?.memberOfSpaces, activeSpaceId],
  );
  const unseenSuffix = unseenDotLabelSuffix({
    suggestions: hasUnseenSuggestions,
    spaces: spacesHaveUnseen,
  });

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
  /**
   * The church's spaces (owned + joined). Computed from the church itself, not
   * from the active parent — the menu is flat, so a church channel is reachable
   * in one click while you're sitting in My Home.
   */
  const churchSpaces = useMemo(() => {
    if (!myChurch?.orgId) return [] as NavSpace[];
    return orderSwitcherSpaces(
      churchHubSpacesForOrg(
        [...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])],
        myChurch.orgId,
      ),
      profile?.sharedSpaceSwitcherOrder,
    );
  }, [nav?.spaces, nav?.memberOfSpaces, myChurch?.orgId, profile?.sharedSpaceSwitcherOrder]);

  /** My Home: one list of personal Shared Spaces (hosted + joined), preference-ordered. */
  const personalSharedSpaces = useMemo(() => {
    const byId = new Map<string, NavSpace>();
    for (const s of nav?.spaces ?? []) {
      if (isPersonalSharedSpace(s)) byId.set(normalizeSharedSpaceSwitcherId(s.id), s);
    }
    for (const s of nav?.memberOfSpaces ?? []) {
      if (isPersonalSharedSpace(s)) byId.set(normalizeSharedSpaceSwitcherId(s.id), s);
    }
    return orderSwitcherSpaces([...byId.values()], profile?.sharedSpaceSwitcherOrder);
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
    // Personal spaces are always listed now (flat menu), so reorder is available
    // whenever the menu is open rather than only in My Home mode.
    orderedSpaceIds: personalSharedIds,
    storedOrder: profile?.sharedSpaceSwitcherOrder,
  });
  const churchSharedIds = useMemo(
    () => churchSpaces.map((s) => normalizeSharedSpaceSwitcherId(s.id)),
    [churchSpaces],
  );
  /**
   * A second instance, not a shared one: a church channel and a personal space are
   * different lists under different headings, and one hook would happily accept a drop
   * across the boundary. Arrangement is a personal display preference either way — it
   * changes nothing for anyone else in the church — so it needs no staff gate.
   */
  const churchDrag = useSharedSpaceSwitcherDragReorder({
    orderedSpaceIds: churchSharedIds,
    storedOrder: profile?.sharedSpaceSwitcherOrder,
  });
  /**
   * Same pairing the planner board uses. The touch delay is what makes a lift distinct
   * from a scroll, and the 8px tolerance is the half that matters: move further than that
   * before the delay elapses and the drawer scrolls instead of the row lifting.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const personalSpacesById = useMemo(() => {
    const map = new Map<string, NavSpace>();
    for (const s of personalSharedSpaces) {
      map.set(normalizeSharedSpaceSwitcherId(s.id), s);
    }
    return map;
  }, [personalSharedSpaces]);
  const displayedPersonalSpaces = useMemo(
    () =>
      spaceDrag.displayOrderedIds
        .map((id) => personalSpacesById.get(id))
        .filter((s): s is NavSpace => Boolean(s)),
    [personalSpacesById, spaceDrag.displayOrderedIds],
  );

  /**
   * Each parent group is capped so a church with twenty channels doesn't turn
   * the switcher into a directory — the overflow gets a "See all" row into that
   * parent's hub, which is the surface built for browsing.
   */
  const visiblePersonalSpaces = displayedPersonalSpaces.slice(0, SWITCHER_SPACES_PER_PARENT);
  const personalOverflow = displayedPersonalSpaces.length - visiblePersonalSpaces.length;
  const churchSpacesById = useMemo(() => {
    const map = new Map<string, NavSpace>();
    for (const s of churchSpaces) {
      map.set(normalizeSharedSpaceSwitcherId(s.id), s);
    }
    return map;
  }, [churchSpaces]);
  const displayedChurchSpaces = useMemo(
    () =>
      churchDrag.displayOrderedIds
        .map((id) => churchSpacesById.get(id))
        .filter((s): s is NavSpace => Boolean(s)),
    [churchSpacesById, churchDrag.displayOrderedIds],
  );
  const visibleChurchSpaces = displayedChurchSpaces.slice(0, SWITCHER_SPACES_PER_PARENT);
  const churchOverflow = displayedChurchSpaces.length - visibleChurchSpaces.length;

  /** A parent row is checked when you're at that parent's hub (no space open). */
  const atHomeHub = protoLocation.parent.kind === 'home' && !activeSpaceId;
  const atChurchHub = protoLocation.parent.kind === 'church' && !activeSpaceId;

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
      const rect = (anchorRef ?? triggerRef).current?.getBoundingClientRect();
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
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      // Either list — a drag in progress must not be read as a click outside, or the
      // menu closes out from under the row being moved.
      if (spaceDrag.isDragging || churchDrag.isDragging) return;
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      /* The external trigger is a button this component does not render; without this the
         segment's own click would close the menu and immediately reopen it. */
      if (anchorRef?.current?.contains(target)) return;
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
  }, [open, anchorRef, setOpen, spaceDrag.isDragging, churchDrag.isDragging]);

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
  const isSegment = trigger === 'segment';
  /*
   * In the Library panel the sidebar must stay where it is.
   *
   * Every selection here otherwise calls `ensureSidebarExpanded`, which was right when
   * this control only ever lived in the sidebar's own header — picking a space meant
   * "show me it", and the rail was where it would be shown. Mounted in the panel, that
   * same call slides the sidebar open *underneath* the panel the reader is using.
   */
  const inPanelHeader = trigger === 'panel-header';
  /*
   * A table rather than a negation, so the next trigger has to answer the question instead
   * of inheriting whichever default it happens to fall on.
   */
  const revealSidebar = REVEALS_SIDEBAR[trigger] ? ensureSidebarExpanded : NOOP;
  /** Pill when a space/channel is selected (title); My Home / My Church hubs stay circular orbs.
   *
   * A title is required, not incidental: the pill's padding is asymmetric because it is
   * sized for icon + label, so rendering it with no label (nav hasn't resolved the space
   * title yet, or the space has none) left dead space to the right of the icon. Without a
   * label the plain orb is the correct shape, tile icon included.
   *
   * The segment has neither problem — it is a fixed half of a two-up control, so it keeps
   * its own width whether or not a title has arrived, and falls back to "Spaces". */
  const useSpaceSwitcherPill =
    !isSegment && showSharedSpaceToolbar && Boolean(sharedSpaceLabel);
  /**
   * The segment names the place you are, the way its other half names the list you are
   * looking at. Not `triggerTitle` itself: that carries the "finish setup in the classic
   * app" sentence, which is a tooltip's length, not a segment's.
   */
  const segmentLabel = sharedSpaceLabel || (inMyChurchMode ? 'My Church' : 'My Home');
  // Pill: color tile + title. Hub modes: plain orb glyphs.
  /*
   * A hub's bare glyph is drawn to the tile's block inside a segment, so My Home does not
   * come out a size smaller than the shared space that replaces it in the very same half.
   * The orb keeps the standard glyph size — there it sits among other orbs, not beside a
   * tile. See PROTO_SEG_GLYPH_SIZE.
   */
  const hubGlyphSize = isSegment ? PROTO_SEG_GLYPH_SIZE : PROTO_TOOLBAR_ORB_ICON_SIZE;
  const triggerIcon = (
    <SpaceSwitcherTriggerIcon
      space={space}
      isMinistry={activeIsMinistry}
      inSharedSpace={showSharedSpaceToolbar}
      inMyChurchMode={inMyChurchMode}
      hasHome={hasHome}
      glyphSize={hubGlyphSize}
    />
  );

  // Every selection closes the menu. The parent chips that used to stay open
  // are gone, and a row that leaves the menu up makes you click again to
  // dismiss what you already chose.

  function selectHome() {
    setOpen(false);
    switchToSpace(null);
    revealSidebar();
  }

  function selectMyChurch() {
    if (!myChurch) return;
    setOpen(false);
    setActiveChurchOrgId(myChurch.orgId);
    revealSidebar();
  }

  /**
   * The parent comes from the space, not from a flag the caller carries.
   * Opening a ministry channel puts you in church context because that is where
   * the channel lives.
   */
  function selectSpace(row: NavSpace) {
    setOpen(false);
    switchToSpace(normalizeSpaceId(row.id), parentForSpace(row));
    revealSidebar();
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

  function renderSpaceRow(
    row: NavSpace,
    options?: {
      nested?: boolean;
      /** The list this row belongs to. Rows drag only among their own siblings. */
      drag?: SpaceSwitcherDragController;
    },
  ) {
    const drag = options?.drag ?? spaceDrag;
    return (
      <SpaceSwitcherRow
        key={row.id}
        row={row}
        nested={Boolean(options?.nested)}
        isDragging={drag.draggingId === normalizeSharedSpaceSwitcherId(row.id)}
        checked={activeSpaceId === normalizeSpaceId(row.id)}
        onSelect={selectSpace}
      />
    );
  }

  const createSheet = (
    <CreateSharedSpaceSheet
      open={createSheetOpen}
      onOpenChange={setCreateSheetOpen}
      orgId={createOrgId}
      kind={createKind}
      // A just-created space isn't in nav yet, so its parent can't be looked
      // up — but the sheet already captured which org it was created under.
      onCreated={(spaceId) => selectSpace({ id: spaceId, orgId: createOrgId } as NavSpace)}
    />
  );

  const popover = open && typeof document !== 'undefined'
    ? createPortal(
        <ProtoPopoverShell
          ref={popoverRef}
          className="proto-menu__popover proto-menu__popover--sidebar-toolbar proto-menu__popover--sidebar-toolbar-portal"
          role="menu"
          aria-label="Spaces"
          style={{ top: anchorPos?.top ?? -9999, left: anchorPos?.left ?? 0 }}
        >
          {/* Places: each parent is a selectable row that also heads its own
              spaces. One flat list, so anything is one click from anywhere. */}
          <div className="proto-menu-section" role="group" aria-label="Places">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={atHomeHub}
              className="proto-menu-item proto-space-switcher__parent-item"
              onClick={selectHome}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <ProtoHouseIcon size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">My Home</span>
              <span className="proto-menu-item__check" aria-hidden>
                {atHomeHub ? <Icon name="check" size={PROTO_MENU_CHECK_ICON_SIZE} /> : null}
              </span>
            </button>

            {/* One context per list, not one shared: a single context would happily
                accept a personal space dropped into the church group. */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(e: DragStartEvent) => spaceDrag.handleDragStart(String(e.active.id))}
              onDragCancel={spaceDrag.handleDragCancel}
              onDragEnd={(e: DragEndEvent) =>
                spaceDrag.handleDragEnd(String(e.active.id), e.over ? String(e.over.id) : null)
              }
            >
              <SortableContext
                items={visiblePersonalSpaces.map((s) => normalizeSharedSpaceSwitcherId(s.id))}
                strategy={verticalListSortingStrategy}
              >
                {visiblePersonalSpaces.map((space) => renderSpaceRow(space, { nested: true }))}
              </SortableContext>
            </DndContext>
            {personalOverflow > 0 ? (
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item proto-space-switcher__see-all"
                onClick={selectHome}
              >
                <span className="proto-menu-item__label">{`See all ${displayedPersonalSpaces.length} in My Home`}</span>
              </button>
            ) : null}
          </div>

          {myChurch ? (
            <div className="proto-menu-section" role="group" aria-label={myChurch.churchName}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={atChurchHub}
                className="proto-menu-item proto-space-switcher__parent-item"
                title={myChurch.churchName}
                onClick={selectMyChurch}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="church" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span
                  className="proto-menu-item__label proto-marquee"
                  title={myChurch.churchName}
                  style={marqueePace(marqueeCharCount(myChurch.churchName))}
                >
                  <span>{myChurch.churchName}</span>
                </span>
                <span className="proto-menu-item__check" aria-hidden>
                  {atChurchHub ? <Icon name="check" size={PROTO_MENU_CHECK_ICON_SIZE} /> : null}
                </span>
              </button>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(e: DragStartEvent) => churchDrag.handleDragStart(String(e.active.id))}
                onDragCancel={churchDrag.handleDragCancel}
                onDragEnd={(e: DragEndEvent) =>
                  churchDrag.handleDragEnd(String(e.active.id), e.over ? String(e.over.id) : null)
                }
              >
                <SortableContext
                  items={visibleChurchSpaces.map((s) => normalizeSharedSpaceSwitcherId(s.id))}
                  strategy={verticalListSortingStrategy}
                >
                  {visibleChurchSpaces.map((space) =>
                    renderSpaceRow(space, { nested: true, drag: churchDrag }),
                  )}
                </SortableContext>
              </DndContext>
              {churchOverflow > 0 ? (
                <button
                  type="button"
                  role="menuitem"
                  className="proto-menu-item proto-space-switcher__see-all"
                  onClick={selectMyChurch}
                >
                  <span className="proto-menu-item__label">{`See all ${churchSpaces.length} in ${myChurch.churchName}`}</span>
                </button>
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
                <span className="proto-menu-item__label">New shared space</span>
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
                <span className="proto-menu-item__label">New channel</span>
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

  if (isExternal) {
    /* No wrapper and no button: the caller owns both, and the seg-track it sits in expects
       exactly three children. All this mode contributes is the menu itself. */
    return (
      <>
        {popover}
        {createSheet}
      </>
    );
  }

  return (
    <div
      className={[
        'proto-menu',
        'proto-sidebar-toolbar__mode-menu',
        isSegment ? 'proto-sidebar-seg__slot' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <PrototypeToolbarShortcutItem showShortcut={showShiftHints}>
        <button
          ref={triggerRef}
          type="button"
          className={
            isSegment
              ? 'proto-sidebar-seg__btn'
              : useSpaceSwitcherPill
                ? 'proto-toolbar-space-switcher'
                : 'proto-toolbar-icon-btn'
          }
          data-active={sidebarLayer === 'space'}
          title={triggerTitle}
          /* The dot is `aria-hidden`, so what it means has to reach the label — otherwise the
             only people told there is something new are the ones who can see 7px of colour. */
          aria-label={unseenSuffix ? `${triggerTitle} — ${unseenSuffix}` : triggerTitle}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={!hasHome}
          // Two jobs, resolved by which layer you're already on — and that's a
          // readout, not hidden state: `data-active` below marks the current
          // layer. Inactive, the orb is a fast view toggle (one click straight
          // to this layer, no menu, nothing to re-pick). Active, it opens the
          // menu. Neither job ever costs two clicks.
          onClick={() => {
            if (!hasHome) return;
            /* No layer to switch to in the panel — its header has one job, so the
               trigger always opens the menu rather than toggling something first. */
            if (REVEALS_SIDEBAR[trigger] && !open && sidebarLayer !== 'space') {
              setSidebarLayer('space');
              ensureSidebarExpanded();
              return;
            }
            setOpen((x) => !x);
          }}
        >
          {isSegment ? (
            <>
              <span className="proto-sidebar-seg__icon" aria-hidden>
                {triggerIcon}
              </span>
              {/* Plain ellipsis for the same reason the pill below uses one — `proto-marquee`
                  would measure zero inside a shrink-to-fit box. */}
              <span className="proto-sidebar-seg__label" title={segmentLabel}>
                {segmentLabel}
              </span>
              {sidebarLayer === 'space' ? (
                <span className="proto-sidebar-seg__chevron" aria-hidden>
                  <Icon name="caret-down" size={11} />
                </span>
              ) : null}
            </>
          ) : useSpaceSwitcherPill ? (
            <>
              <span className="proto-toolbar-space-switcher__icon" aria-hidden>
                {triggerIcon}
              </span>
              {/* Plain ellipsis, not `proto-marquee`, and the same treatment the folder
                  chip beside it already uses. The marquee's `container-type: inline-size`
                  zeroes an element's intrinsic contribution, and this pill is
                  shrink-to-fit — so the title measured 0px wide and the pill rendered as
                  an icon followed by its label-side padding. A title that never appears
                  is a worse trade than a long one that ellipsizes to its `title`. */}
              {sharedSpaceLabel ? (
                <span className="proto-toolbar-space-switcher__label" title={sharedSpaceLabel}>
                  {sharedSpaceLabel}
                </span>
              ) : null}
            </>
          ) : (
            triggerIcon
          )}
          {unseenSuffix ? (
            <span className="proto-toolbar-icon-btn__unseen-dot" aria-hidden />
          ) : null}
        </button>
      </PrototypeToolbarShortcutItem>
      {popover}
      {createSheet}
    </div>
  );
}
