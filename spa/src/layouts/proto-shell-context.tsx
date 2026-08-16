import { clearComposeRestoreStash } from '../lib/compose-session-restore';
import { clearNoteDraft } from '@/utils/note-draft-store';
import {
  PROTOTYPE_DRAFT_NOTE_ID,
  resolveComposeSeed,
  shouldClearStaleComposeDraftOnSessionStart,
} from '@/utils/prototype-draft-compose-session';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PROTO_EXPANDED_SIDEBAR_EXIT_MS, PROTO_PANEL_EXIT_MS } from './proto-motion';
import {
  clearPersistedDrilldowns,
  readPersistedSidebarNav,
  writePersistedSidebarNav,
  type SidebarListSpaceScope,
} from '../pages/prototype/proto-sidebar-nav-store';
import {
  HOME_LOCATION,
  churchParent,
  isSameLocation,
  locationFromStoredPair,
  parentOrgId,
  storedPairFromLocation,
  type ProtoLocation,
} from './proto-location';
import type { ScriptureDrillState } from '../pages/prototype/sidebar-universal-search';
import { setComposeGroupThreadId } from '../lib/compose-group-thread';

/** Breakpoint sync with prototype-shell.css (899px drawer). */
const MOBILE_MQ = '(max-width: 899px)';
const PROTO_SIDEBAR_WIDTH_STORAGE_KEY = 'harvous-prototype-sidebar-width';
export const PROTO_SIDEBAR_WIDTH_DEFAULT = 304;
export const PROTO_SIDEBAR_WIDTH_MIN = 304;
export const PROTO_SIDEBAR_WIDTH_MAX = 420;
/** Native `SidebarToolbarLayout.narrowColumnToolbarSuppressBelow`. */
export const PROTO_SIDEBAR_TOOLBAR_SUPPRESS_BELOW = 210;

function clampSidebarWidth(width: number) {
  return Math.min(PROTO_SIDEBAR_WIDTH_MAX, Math.max(PROTO_SIDEBAR_WIDTH_MIN, width));
}

function readStoredSidebarWidth() {
  if (typeof window === 'undefined') return PROTO_SIDEBAR_WIDTH_DEFAULT;
  try {
    const raw = localStorage.getItem(PROTO_SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return PROTO_SIDEBAR_WIDTH_DEFAULT;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return PROTO_SIDEBAR_WIDTH_DEFAULT;
    return clampSidebarWidth(parsed);
  } catch {
    return PROTO_SIDEBAR_WIDTH_DEFAULT;
  }
}

/**
 * 'resources' is the odd one out: notes/folders/threads list things you made,
 * highlights/scripture are derived indexes over note content, and resources is
 * a catalog you curate deliberately (see docs/future/RESOURCE_LIBRARY.md).
 */
export type SidebarListMode = 'notes' | 'folders' | 'highlights' | 'scripture' | 'threads' | 'resources';

/**
 * What a sidebar multi-selection holds.
 *
 * Threads split into two because they are two different objects with two
 * different actions behind them: a personal cluster is a set of connected
 * notes, a shared Thread is a row in a room that only its owner may delete.
 */
export type SidebarSelectionKind =
  | 'note'
  | 'highlight'
  | 'resource'
  | 'folder'
  | 'thread'
  | 'sharedThread';

/**
 * What entering select mode in a given list selects — and `null` for lists that cannot be
 * selected at all.
 *
 * One mapping, used both to label the menu item and to set the selection kind. They used to be
 * separate: the label had its own `sidebarListMode` chain while the enter/exit handler called
 * `setSidebarSelectMode` with no kind at all and hardcoded `'note'` on the way out, so leaving
 * select mode in a folders list cleared a note selection that was never there.
 *
 * Scripture maps to null on purpose. Its rows render no select affordance at any level — the
 * books and passages levels are plain cards and rows — so offering "Select" there was a visible
 * no-op. The type has never had a 'scripture' member, which is the same statement in a
 * different place.
 */
export function sidebarSelectionKindForListMode(mode: SidebarListMode): SidebarSelectionKind | null {
  switch (mode) {
    case 'notes':
      return 'note';
    case 'highlights':
      return 'highlight';
    case 'folders':
      return 'folder';
    case 'threads':
      return 'thread';
    case 'resources':
      return 'resource';
    case 'scripture':
      return null;
  }
}

/** Sidebar layer — Home space dashboard vs the list views. Only 'space' layer content today is My Home. */
export type SidebarLayer = 'space' | 'list';

export type VisibleComposeTargetInput = {
  homeSpaceId: string | null | undefined;
  activeSpaceId: string | null | undefined;
  /** @deprecated No longer affects placement — kept so call sites need no edit. */
  sidebarLayer?: SidebarLayer;
  /** @deprecated No longer affects placement — kept so call sites need no edit. */
  sidebarListSpaceScope?: SidebarListSpaceScope;
};

function normalizeComposeSpaceId(spaceId: string | null | undefined): string | null {
  const trimmed = spaceId?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('space_') ? trimmed : `space_${trimmed}`;
}

/**
 * New-note placement: the space you are in, full stop.
 *
 * This used to also key off `sidebarLayer` / `sidebarListSpaceScope`, so a note
 * composed while a shared space was active could silently land in My Home just
 * because the list happened to be scoped there. Once the switcher is authoritative
 * navigation, "compose where you're looking" is the bug rather than the feature —
 * the list scope is a filter over what you're browsing, not a statement about
 * where new work belongs.
 */
export function resolveVisibleComposeTarget({
  homeSpaceId,
  activeSpaceId,
}: VisibleComposeTargetInput): string | null {
  const home = normalizeComposeSpaceId(homeSpaceId);
  const active = normalizeComposeSpaceId(activeSpaceId);
  return active ?? home;
}

export function isVisiblePrototypeSharedContext(options: {
  explicitContextSpaceId?: string | null;
  visibleTargetSpaceId?: string | null;
  homeSpaceId?: string | null;
}): boolean {
  if (options.explicitContextSpaceId?.trim()) return true;
  const visible = normalizeComposeSpaceId(options.visibleTargetSpaceId);
  const home = normalizeComposeSpaceId(options.homeSpaceId);
  return Boolean(visible && visible !== home);
}

/** A proposed thread surfaced from a Home theme card, pending user review/accept. */
export interface ThreadProposal {
  /** Proposed thread title (the theme/subject). */
  subject: string;
  /** Notes that would be connected into the thread. */
  notes: Array<{ id: string; title: string | null }>;
  /** Drives review copy; defaults to subject-style. */
  variant?: 'subject' | 'arc' | 'crossref';
}

const SIDEBAR_LIST_MODE_STORAGE_KEY = 'harvous-prototype-sidebar-list-mode';
const SIDEBAR_LIST_MODE_DEFAULT: SidebarListMode = 'notes';
const VALID_MODES = new Set<SidebarListMode>(['notes', 'folders', 'highlights', 'scripture', 'threads', 'resources']);

function readStoredSidebarListMode(): SidebarListMode {
  if (typeof window === 'undefined') return SIDEBAR_LIST_MODE_DEFAULT;
  try {
    const raw = localStorage.getItem(SIDEBAR_LIST_MODE_STORAGE_KEY);
    if (raw === 'dictionary') return SIDEBAR_LIST_MODE_DEFAULT;
    if (raw && VALID_MODES.has(raw as SidebarListMode)) return raw as SidebarListMode;
  } catch { /* ignore */ }
  return SIDEBAR_LIST_MODE_DEFAULT;
}

/** `undefined` = top-level list; `null` = “No folder” drill-down; `string` = named folder. */
export type SidebarFolderDrilldown = string | null | undefined;

/** Home greeting tag chip → notes list search prefilled with this tag. */
export type SidebarTagSearchIntent = {
  tagId: string;
  tagName: string;
};

/** Toolbar folder chip on prototype note routes — driven by note page + editor collection state. */
export type PrototypeFolderChip = {
  noteId: string;
  label: string | null;
  extraCount: number;
  /** Full folder list for accessibility (primary + secondaries). */
  membershipLabels: string[];
};

function prototypeFolderChipsEqual(
  a: PrototypeFolderChip | null,
  b: PrototypeFolderChip | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  return (
    a.noteId === b.noteId &&
    a.label === b.label &&
    a.extraCount === b.extraCount &&
    a.membershipLabels.length === b.membershipLabels.length &&
    a.membershipLabels.every((label, index) => label === b.membershipLabels[index])
  );
}

/** Toolbar folder chip value — isolated so note-page edits don't re-render the whole shell. */
const PrototypeFolderChipContext = createContext<PrototypeFolderChip | null>(null);

/**
 * What a compose session opens with, when the affordance that started it already knows.
 *
 * The point is that "add this" paints instantly: the editor mounts with the passage or the
 * sermon title already in it and persists in the background, rather than the caller awaiting a
 * create round trip to learn a note id before it can navigate anywhere.
 */
export type PrototypeComposeSeed = {
  title?: string;
  contentHtml?: string;
  /** Carried through to the create call so provenance survives the deferred persist. */
  startedFromServiceId?: string;
  startedFromServiceTitle?: string;
  startedFromTemplateId?: string;
  startedFromTemplateName?: string;
  /** Folder the starting affordance already knows about (e.g. a sermon series). */
  primaryCollection?: string;
  /** Chosen by a human (a series name), so the auto-folder pass must not overwrite it. */
  collectionUserOverride?: boolean;
};

/** Scripture-passage highlight opened from Highlights list — main pane shows standalone passage (native dock parity). */
export type StandaloneScripturePassageState = {
  canonicalReference: string;
  translationCode: string;
  focusedHighlightThreadId: string;
};

/**
 * Where a stacked sheet should go back to — captured the moment the stack is made, so a
 * flip-down or collapse lands where you actually came from even after the sheet's own URL
 * has changed (a compose draft saves to `/{noteId}`; an expanded reader wanders chapters).
 */
export type PaperStackReturnTo = {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string | undefined>;
};

/**
 * The paper a sheet is stacked over: why you got here, and how to get back.
 *
 * `kind` is the origin surface. Two are the same pattern in opposite directions — the
 * reader is the *base* under a note (`reader`) or the *sheet* over a note (`noteDock`,
 * where a scripture dock expanded into the chapter it is a snippet of). `homeCard` is a
 * Home recall/revisit card, whose base is a small card restating why you were sent here,
 * because Home has no main-pane document to stand behind the note.
 *
 * `label` + `icon` are all the peeking edge shows. `base` is what renders underneath —
 * a chapter for the reader, an origin card for everything else.
 */
/**
 * Where on screen the sheet grew out of — viewport coordinates, captured at stack time.
 *
 * Only a `noteDock` sets it, and only so the chapter can morph out of the dock card that
 * asked for it instead of cross-fading in from nowhere. Measured rather than assumed
 * because the dock's position depends on the sidebar, the note's width and how many cards
 * are in the carousel; a guess would be wrong on most screens.
 */
export type PaperStackMorphFrom = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type PaperStackOrigin = {
  kind: 'reader' | 'homeCard' | 'noteDock';
  /** See `PaperStackMorphFrom`. Absent means "no morph" — the sheet just arrives. */
  morphFrom?: PaperStackMorphFrom;
  /** Sub-kind for `homeCard` (a RecallOpportunityKind or 'revisit'). Telemetry only. */
  cardKind?: string;
  /**
   * The suggestion that sent you here, when one did.
   *
   * Present only for a recall row off Home's Suggested shelf, and it is what turns the edge
   * from a label into something you can answer: the id is the row to put back or to rest,
   * and the kind is what to record it as. A `revisit` card or a chapter has no suggestion —
   * nothing proposed them — so their edge stays a plain way back.
   */
  suggestion?: { id: string; kind: string };
  label: string;
  icon: string;
  returnTo: PaperStackReturnTo;
  base:
    | { type: 'reader'; book: string; chapter: number; translation: string; fromVerse?: number }
    | { type: 'originCard'; eyebrow?: string; title: string; meta?: string; icon: string };
};

/**
 * Shell state rather than route state on purpose. Saving a compose draft navigates to
 * `/{noteId}`, so a stack derived from the URL would collapse the moment the note saved —
 * exactly when the origin most needs to still be there. Holding it here lets the URL follow
 * the top sheet while the paper underneath stays mounted and keeps its scroll position.
 *
 * Exactly one edge: a new `stackNote` replaces whatever was stacked before.
 */
export type PaperStackState = {
  origin: PaperStackOrigin;
  /**
   * The stacked note's id once it has one. A compose draft stacks without one; the layout's
   * teardown effect adopts the first note path it sees (the save navigation), which is what
   * keeps saving from reading as "navigated to a different note" and clearing the stack.
   */
  noteId?: string;
  /**
   * The stacked note's title, as it reads right now — the parked edge is the note's own
   * label, so it has to follow a title being typed, not the one it had when it was stacked.
   * Reported by the note page while it is the sheet; absent until it says so, and absent
   * for a blank draft, where the edge falls back to the app's word for an untitled note.
   */
  noteTitle?: string;
  /**
   * Whether the sheet is up. Flipping down sets this false and leaves the sheet mounted
   * below the fold, so the draft is still there when you flip back — closing it for real
   * is `clearPaperStack`.
   */
  open: boolean;
};

/** Bottom chrome on note routes — format bar, scripture dock, etc. */
export type PrototypeEditorChromeMode =
  | 'format'
  /**
   * Touch only: the note-body selection actions have taken over the format slot. On iOS the
   * system text callout ("Copy | Look Up | Translate") lands right where a floating capsule at
   * the selection would, and there is no API to suppress it — so we vacate that space and put
   * our actions in the chrome bar instead, the same way the scripture dock does for passages.
   */
  | 'selection'
  | 'scripture'
  | 'highlight'
  | 'reference'
  | 'noteActions'
  | 'hidden';

type ProtoShellContextValue = {
  /** Desktop: pinned open. Mobile drawer: overlay open flag. */
  drawerOpen: boolean;
  toggleDrawer: () => void;
  openDrawer: () => void;
  /** Close the mobile drawer. Pass `preserveHistory: true` when navigating away so swipe-back reopens it. */
  closeDrawer: (options?: { preserveHistory?: boolean }) => void;
  isMobileSidebar: boolean;
  /** Desktop only: hides the pinned sidebar column (toolbar toggle ⌘\ equivalent). */
  desktopSidebarCollapsed: boolean;
  /** True during sidebar close animation — keep the panel mounted (mobile drawer + desktop collapse). */
  sidebarExiting: boolean;
  toggleDesktopSidebar: () => void;
  /** Desktop sidebar width in px, clamped to Mac-like bounds. */
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  persistSidebarWidth: (width?: number) => void;
  sidebarWidthMin: number;
  sidebarWidthMax: number;
  /** Sidebar layer — 'space' shows the Home/space view, 'list' shows the list views. Persisted across refresh. */
  sidebarLayer: SidebarLayer;
  setSidebarLayer: (layer: SidebarLayer) => void;
  /**
   * Where the user is — parent (My Home / a church) plus the space inside it.
   * The single source of truth; everything below is derived. Persisted across refresh.
   */
  location: ProtoLocation;
  /**
   * The one navigation writer. Prefer this over the two shims below: it takes
   * the parent and the space together, so they cannot disagree. Use
   * `locationForSpace(space)` from proto-location.ts to derive the parent from
   * a space rather than tracking it at the call site.
   */
  setLocation: (next: ProtoLocation) => void;
  /** Derived from `location`. Selected space (`space_...`); null = the parent's hub. */
  activeSpaceId: string | null;
  /** Shim — keeps the current parent. Prefer `setLocation`. `null` returns to My Home. */
  setActiveSpaceId: (spaceId: string | null) => void;
  /** Derived from `location`. Home church Clerk org id when the parent is a church, else null. */
  activeChurchOrgId: string | null;
  /** Shim — enter/leave a church parent, landing on its hub. Prefer `setLocation`. */
  setActiveChurchOrgId: (orgId: string | null) => void;
  /** List sidebar scope overlay when a shared space is active (does not change `activeSpaceId`). */
  sidebarListSpaceScope: SidebarListSpaceScope;
  setSidebarListSpaceScope: (scope: SidebarListSpaceScope) => void;
  /** Notes / folders / highlights / scripture sidebar list mode. */
  /**
   * Multi-select in the sidebar note list. Lives here rather than in `PrototypeSidebar`
   * because the trigger is in `ListViewMenu` (rendered by `PrototypeSidebarToolbar`), a
   * sibling of the component that owns the lists.
   */
  sidebarSelectMode: boolean;
  setSidebarSelectMode: (on: boolean) => void;
  /**
   * What the selected ids *are*.
   *
   * One kind at a time, deliberately: a bulk bar offers the actions of a single
   * kind of thing, and a set holding two notes and a folder has no honest set
   * of actions. Ticking a row of another kind replaces the selection rather
   * than refusing it — a checkbox that declines to tick reads as broken.
   */
  sidebarSelectionKind: SidebarSelectionKind;
  sidebarSelectedIds: string[];
  /** Replaces the selection outright, kind included. */
  setSidebarSelection: (kind: SidebarSelectionKind, ids: string[]) => void;
  sidebarListMode: SidebarListMode;
  setSidebarListMode: (mode: SidebarListMode) => void;
  sidebarFolderDrilldown: SidebarFolderDrilldown;
  setSidebarFolderDrilldown: (value: SidebarFolderDrilldown) => void;
  /** Representative note ID of the drilled thread cluster; undefined = showing cluster list. */
  sidebarThreadDrilldownId: string | undefined;
  setSidebarThreadDrilldownId: (id: string | undefined) => void;
  /** Scripture index drill — books, passages, or notes within a passage. Persisted across refresh. */
  scriptureDrill: ScriptureDrillState;
  setScriptureDrill: (value: ScriptureDrillState) => void;
  /** Proposed thread under review (from a Home theme card); undefined = no review open. Not persisted. */
  sidebarThreadProposal: ThreadProposal | undefined;
  setSidebarThreadProposal: (proposal: ThreadProposal | undefined) => void;
  /** Open mobile drawer or expand desktop sidebar so the list is visible. */
  ensureSidebarExpanded: () => void;
  /** Pending tag search from Home greeting — consumed by PrototypeSidebar. */
  sidebarTagSearchIntent: SidebarTagSearchIntent | null;
  openSidebarTagSearch: (intent: SidebarTagSearchIntent) => void;
  clearSidebarTagSearchIntent: () => void;
  /** Inspector pane — desktop: inline column; mobile: slide-over on note page. */
  inspectorOpen: boolean;
  /** True during the exit animation window — keep the panel mounted while this is true. */
  inspectorExiting: boolean;
  toggleInspector: () => void;
  openInspector: () => void;
  closeInspector: () => void;
  /** Study thread popover from inspector — persists while switching notes in the sidebar. */
  studyThreadPopoverOpen: boolean;
  openStudyThreadPopover: () => void;
  closeStudyThreadPopover: () => void;
  /** Study thread panel — reusable expandable right-side layer over a note. */
  threadPanelNoteId: string | null;
  threadPanelExiting: boolean;
  threadPanelExpanded: boolean;
  openThreadPanel: (noteId: string, options?: { expanded?: boolean }) => void;
  closeThreadPanel: () => void;
  expandThreadPanel: () => void;
  /** Expanded thread → inspector (note details); does not leave a docked thread panel. */
  backFromThreadPanelToInspector: (options?: { popHistory?: boolean }) => void;
  /**
   * Expanded sidebar tool — a left-anchored surface that grows out of the
   * sidebar's footprint and covers the main pane, for tools the 304–420px
   * sidebar cannot hold (boards, calendars, master-detail).
   *
   * Generic on purpose: the value is a tool key ('planner' today; challenges
   * and reviews later), so the shell hosts one surface and each tool brings
   * its own body. The editor underneath stays mounted — this overlays, it
   * does not replace the main pane.
   */
  expandedSidebarTool: string | null;
  /** True during the exit animation window — keep the panel mounted while this is true. */
  expandedSidebarExiting: boolean;
  openExpandedSidebar: (tool: string) => void;
  closeExpandedSidebar: (options?: { preserveHistory?: boolean }) => void;
  setPrototypeFolderChip: (value: PrototypeFolderChip | null) => void;
  /** Backend note id after first autosave during compose-on-home — before URL replace. */
  composePersistedNoteId: string | null;
  setComposePersistedNoteId: (noteId: string | null) => void;
  /**
   * True while composing a draft on `/` (no note path). Cleared when the idle
   * replace lands on `/{slug}` or the user leaves the compose session.
   */
  composeDraftActive: boolean;
  clearComposeDraftActive: () => void;
  /** Bumped on each explicit compose action so compose-on-home gets a fresh editor session. */
  composeSessionEpoch: number;
  /** When set, the next draft compose targets this space instead of the active shared space. */
  composeTargetSpaceIdOverride: string | null;
  clearComposeTargetSpaceIdOverride: () => void;
  /** Retarget an in-progress draft to a different space. */
  setComposeTargetSpaceId: (spaceId: string | null) => void;
  beginPrototypeComposeSession: (options?: {
    targetSpaceId?: string;
    seed?: PrototypeComposeSeed;
  }) => number;
  /**
   * Seed for the *current* compose session, or null. Already epoch-checked — a seed left over
   * from a previous session reads as null here rather than leaking into this note.
   */
  composeSeed: PrototypeComposeSeed | null;
  standaloneScripturePassage: StandaloneScripturePassageState | null;
  openStandaloneScripturePassage: (value: StandaloneScripturePassageState) => void;
  dismissStandaloneScripturePassage: () => void;
  /** Non-null while a sheet is stacked over an origin paper (reader, Home card, note). */
  paperStack: PaperStackState | null;
  /** Stack a sheet over an origin. Replaces any existing stack — there is exactly one edge. */
  stackNote: (origin: PaperStackOrigin, noteId?: string) => void;
  /** Flip the sheet down (or back up) without unmounting it. */
  setStackSheetOpen: (open: boolean) => void;
  /**
   * Record the stacked note's id once a compose draft has saved and has one. Called by the
   * layout's teardown effect, not by surfaces.
   */
  adoptStackNoteId: (noteId: string) => void;
  /** Keep the parked edge's label in step with the title the note currently has. */
  setStackNoteTitle: (noteTitle: string) => void;
  /** While parked, move a reader origin to the chapter actually being read. */
  retargetStackOrigin: (
    base: { book: string; chapter: number; translation: string },
    returnTo: PaperStackReturnTo,
  ) => void;
  clearPaperStack: () => void;
  /** Note editor bottom chrome (shell grid row — spans sidebar + main). */
  editorChromeMode: PrototypeEditorChromeMode;
  setEditorChromeMode: (mode: PrototypeEditorChromeMode) => void;
  formatToolbarHostEl: HTMLDivElement | null;
  setFormatToolbarHostEl: (el: HTMLDivElement | null) => void;
  studyDockCarouselHostEl: HTMLDivElement | null;
  setStudyDockCarouselHostEl: (el: HTMLDivElement | null) => void;
  /** Search route hides sidebar — chrome row skips the sidebar gutter pad. */
  hideSidebar: boolean;
  setHideSidebar: (hide: boolean) => void;
};

const ProtoShellContext = createContext<ProtoShellContextValue | null>(null);

export function ProtoShellProvider({ children }: { children: ReactNode }) {
  const [isMobileSidebar, setIsMobileSidebar] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_MQ).matches;
  });
  /** On mobile sidebar starts closed; on desktop pinned open */
  const [drawerOpen, setDrawerOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia(MOBILE_MQ).matches;
  });
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidthState] = useState(readStoredSidebarWidth);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorExiting, setInspectorExiting] = useState(false);
  const inspectorExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [studyThreadPopoverOpen, setStudyThreadPopoverOpen] = useState(false);
  const [threadPanelNoteId, setThreadPanelNoteId] = useState<string | null>(null);
  const [threadPanelExiting, setThreadPanelExiting] = useState(false);
  const [threadPanelExpanded, setThreadPanelExpanded] = useState(false);
  const threadPanelExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Skips the next popstate collapse when we called history.back() from collapse/close. */
  const threadPanelHistorySkipRef = useRef(false);
  const THREAD_PANEL_HISTORY_FLAG = 'protoThreadPanelExpanded';
  /** Skips the next popstate when we called history.back() from an explicit drawer dismiss. */
  const drawerHistorySkipRef = useRef(false);
  const MOBILE_DRAWER_HISTORY_FLAG = 'protoMobileDrawerOpen';
  const drawerOpenRef = useRef(drawerOpen);
  drawerOpenRef.current = drawerOpen;
  const threadPanelExpandedRef = useRef(threadPanelExpanded);
  threadPanelExpandedRef.current = threadPanelExpanded;
  const [expandedSidebarTool, setExpandedSidebarTool] = useState<string | null>(null);
  const [expandedSidebarExiting, setExpandedSidebarExiting] = useState(false);
  const expandedSidebarExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Skips the next popstate close when we called history.back() from an explicit close. */
  const expandedSidebarHistorySkipRef = useRef(false);
  const EXPANDED_SIDEBAR_HISTORY_FLAG = 'protoExpandedSidebarTool';
  const expandedSidebarToolRef = useRef(expandedSidebarTool);
  expandedSidebarToolRef.current = expandedSidebarTool;
  const [sidebarExiting, setSidebarExiting] = useState(false);
  const sidebarExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sidebarListMode, setSidebarListModeState] = useState<SidebarListMode>(readStoredSidebarListMode);
  const persistedNav = readPersistedSidebarNav();
  const [sidebarLayer, setSidebarLayerState] = useState<SidebarLayer>(persistedNav.layer);
  /**
   * Single source of truth for "where am I". `activeSpaceId` and
   * `activeChurchOrgId` below are derived reads of this — see proto-location.ts
   * for why the pair became one value.
   */
  const [location, setLocationState] = useState<ProtoLocation>(() =>
    locationFromStoredPair(persistedNav),
  );
  const activeSpaceId = location.spaceId;
  const activeChurchOrgId = parentOrgId(location.parent);
  /** Lets the space-id shim read the current parent without a stale closure. */
  const locationRef = useRef(location);
  locationRef.current = location;
  const [sidebarListSpaceScope, setSidebarListSpaceScopeState] = useState<SidebarListSpaceScope>(
    persistedNav.sidebarListSpaceScope,
  );
  const [sidebarFolderDrilldown, setSidebarFolderDrilldownState] = useState<SidebarFolderDrilldown>(
    persistedNav.folderDrill,
  );
  const [sidebarThreadDrilldownId, setSidebarThreadDrilldownIdState] = useState<string | undefined>(
    persistedNav.threadDrillId,
  );
  const [scriptureDrill, setScriptureDrillState] = useState<ScriptureDrillState>(persistedNav.scriptureDrill);
  /** Transient — a Home theme card's proposed thread awaiting review. Never persisted. */
  const [sidebarThreadProposal, setSidebarThreadProposal] = useState<ThreadProposal | undefined>(undefined);
  const [sidebarTagSearchIntent, setSidebarTagSearchIntent] = useState<SidebarTagSearchIntent | null>(null);
  const [prototypeFolderChip, setPrototypeFolderChipState] = useState<PrototypeFolderChip | null>(null);
  const [composePersistedNoteId, setComposePersistedNoteIdState] = useState<string | null>(null);
  const [composeDraftActive, setComposeDraftActive] = useState(false);
  const [composeTargetSpaceIdOverride, setComposeTargetSpaceIdOverrideState] = useState<string | null>(null);
  const [composeSessionEpoch, setComposeSessionEpoch] = useState(0);
  /**
   * Title/body a compose session opens with, when the thing that started it already knows what
   * the note should say — the daily passage, a sermon starter, a "keep going in Romans" card.
   *
   * Stamped with the epoch it belongs to, exactly like `liveNoteSnapshot`, and read only when
   * the two match. That is the whole safety story: a seed cannot outlive its session and turn
   * up in the next note the way compose drafts once did.
   *
   * Deliberately NOT routed through `saveNoteDraft`. The draft store is a crash-recovery
   * artifact, and CardFullEditable treats any `note_draft` written by the current page session
   * as self-inflicted and clears it — a seed written there would be thrown away before the
   * editor read it.
   */
  const [composeSeedState, setComposeSeedState] = useState<{
    seed: PrototypeComposeSeed;
    epoch: number;
  } | null>(null);
  /**
   * Read-side mirror of the epoch, so `beginPrototypeComposeSession` can branch on it
   * synchronously. It must NOT live inside the `setComposeSessionEpoch` updater — React
   * double-invokes updaters in StrictMode, which would advance it twice per compose.
   */
  const composeSessionEpochRef = useRef(0);
  const [standaloneScripturePassage, setStandaloneScripturePassage] = useState<StandaloneScripturePassageState | null>(
    null,
  );
  const [paperStack, setPaperStack] = useState<PaperStackState | null>(null);
  const [editorChromeMode, setEditorChromeMode] = useState<PrototypeEditorChromeMode>('hidden');
  const [formatToolbarHostEl, setFormatToolbarHostEl] = useState<HTMLDivElement | null>(null);
  const [studyDockCarouselHostEl, setStudyDockCarouselHostEl] = useState<HTMLDivElement | null>(null);
  const [hideSidebar, setHideSidebar] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const clearMobileDrawerHistoryFlag = () => {
      const state = window.history.state as Record<string, unknown> | null;
      if (!state?.[MOBILE_DRAWER_HISTORY_FLAG]) return;
      const next = { ...state };
      delete next[MOBILE_DRAWER_HISTORY_FLAG];
      window.history.replaceState(next, '');
    };
    /* The two breakpoints render the tool surface differently enough (overlay vs
       full-screen takeover) that carrying one across the flip lands mid-animation
       in the wrong geometry. Drop it, same as the drawer. */
    const clearExpandedSidebar = () => {
      const state = window.history.state as Record<string, unknown> | null;
      if (state?.[EXPANDED_SIDEBAR_HISTORY_FLAG]) {
        const next = { ...state };
        delete next[EXPANDED_SIDEBAR_HISTORY_FLAG];
        window.history.replaceState(next, '');
      }
      if (expandedSidebarExitTimerRef.current) clearTimeout(expandedSidebarExitTimerRef.current);
      expandedSidebarExitTimerRef.current = null;
      setExpandedSidebarTool(null);
      setExpandedSidebarExiting(false);
    };
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => {
      const mobile = mq.matches;
      setIsMobileSidebar(mobile);
      clearExpandedSidebar();
      if (mobile) {
        clearMobileDrawerHistoryFlag();
        setDrawerOpen(false);
        setDesktopSidebarCollapsed(false);
        if (sidebarExitTimerRef.current) clearTimeout(sidebarExitTimerRef.current);
        sidebarExitTimerRef.current = null;
        setSidebarExiting(false);
      } else {
        clearMobileDrawerHistoryFlag();
        setDrawerOpen(true);
      }
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const cancelSidebarExit = useCallback(() => {
    if (sidebarExitTimerRef.current) clearTimeout(sidebarExitTimerRef.current);
    sidebarExitTimerRef.current = null;
    setSidebarExiting(false);
  }, []);

  const beginSidebarClose = useCallback(
    (complete: () => void) => {
      if (sidebarExitTimerRef.current) clearTimeout(sidebarExitTimerRef.current);
      setSidebarExiting(true);
      sidebarExitTimerRef.current = setTimeout(() => {
        complete();
        setSidebarExiting(false);
        sidebarExitTimerRef.current = null;
      }, PROTO_PANEL_EXIT_MS);
    },
    [],
  );

  /**
   * The expanded-tool surface answers Back on both breakpoints, not just mobile:
   * it covers the whole main pane, so Back reading as "close this" is the same
   * bargain the expanded thread panel struck. The flag is pushed after the
   * drawer's, so on mobile the first Back closes the tool and the second closes
   * the drawer underneath it.
   */
  const pushExpandedSidebarHistory = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.[EXPANDED_SIDEBAR_HISTORY_FLAG]) return;
    window.history.pushState({ ...(state ?? {}), [EXPANDED_SIDEBAR_HISTORY_FLAG]: true }, '');
  }, []);

  const popExpandedSidebarHistory = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = window.history.state as Record<string, unknown> | null;
    if (!state?.[EXPANDED_SIDEBAR_HISTORY_FLAG]) return;
    expandedSidebarHistorySkipRef.current = true;
    window.history.back();
  }, []);

  const beginExpandedSidebarClose = useCallback(() => {
    if (!expandedSidebarToolRef.current) return;
    if (expandedSidebarExitTimerRef.current) clearTimeout(expandedSidebarExitTimerRef.current);
    setExpandedSidebarExiting(true);
    expandedSidebarExitTimerRef.current = setTimeout(() => {
      setExpandedSidebarTool(null);
      setExpandedSidebarExiting(false);
      expandedSidebarExitTimerRef.current = null;
    }, PROTO_EXPANDED_SIDEBAR_EXIT_MS);
  }, []);

  const openExpandedSidebar = useCallback(
    (tool: string) => {
      if (expandedSidebarExitTimerRef.current) clearTimeout(expandedSidebarExitTimerRef.current);
      expandedSidebarExitTimerRef.current = null;
      setExpandedSidebarExiting(false);
      setExpandedSidebarTool(tool);
      pushExpandedSidebarHistory();
    },
    [pushExpandedSidebarHistory],
  );

  const closeExpandedSidebar = useCallback(
    (options?: { preserveHistory?: boolean }) => {
      if (!expandedSidebarToolRef.current) return;
      if (!options?.preserveHistory) popExpandedSidebarHistory();
      beginExpandedSidebarClose();
    },
    [beginExpandedSidebarClose, popExpandedSidebarHistory],
  );

  const pushMobileDrawerHistory = useCallback(() => {
    if (typeof window === 'undefined' || !isMobileSidebar) return;
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.[MOBILE_DRAWER_HISTORY_FLAG]) return;
    window.history.pushState({ ...(state ?? {}), [MOBILE_DRAWER_HISTORY_FLAG]: true }, '');
  }, [isMobileSidebar]);

  const popMobileDrawerHistory = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = window.history.state as Record<string, unknown> | null;
    if (!state?.[MOBILE_DRAWER_HISTORY_FLAG]) return;
    drawerHistorySkipRef.current = true;
    window.history.back();
  }, []);

  const closeDrawer = useCallback(
    (options?: { preserveHistory?: boolean }) => {
      if (!drawerOpenRef.current) return;
      if (!options?.preserveHistory) popMobileDrawerHistory();
      setDrawerOpen((prev) => {
        if (!prev) return false;
        beginSidebarClose(() => setDrawerOpen(false));
        return true;
      });
    },
    [beginSidebarClose, popMobileDrawerHistory],
  );
  const collapseDesktopSidebar = useCallback(() => {
    if (desktopSidebarCollapsed || sidebarExiting) return;
    /* The expanded tool is anchored to the sidebar's footprint — collapsing the
       anchor out from under it reads as a bug, so the tool leaves with it. */
    closeExpandedSidebar();
    /* Collapse grid immediately so main/editor ease in sync with the panel exit. */
    setDesktopSidebarCollapsed(true);
    beginSidebarClose(() => undefined);
  }, [beginSidebarClose, closeExpandedSidebar, desktopSidebarCollapsed, sidebarExiting]);
  const toggleDesktopSidebar = useCallback(() => {
    if (desktopSidebarCollapsed) {
      cancelSidebarExit();
      setDesktopSidebarCollapsed(false);
      return;
    }
    collapseDesktopSidebar();
  }, [cancelSidebarExit, collapseDesktopSidebar, desktopSidebarCollapsed]);
  const setSidebarWidth = useCallback((width: number) => {
    setSidebarWidthState(clampSidebarWidth(width));
  }, []);
  const persistSidebarWidth = useCallback((width?: number) => {
    if (typeof window === 'undefined') return;
    try {
      const clamped = clampSidebarWidth(width ?? sidebarWidth);
      localStorage.setItem(PROTO_SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);
  const setSidebarLayer = useCallback((layer: SidebarLayer) => {
    setSidebarLayerState(layer);
    writePersistedSidebarNav({ layer });
  }, []);
  /**
   * The one writer for "where am I". Every navigation goes through here, so the
   * parent and the space can never disagree — which is what the old pair of
   * setters had to maintain by hand, each nulling the other.
   *
   * Always lands on the space layer and clears drill-downs: changing context
   * resets scope (mirrors native "switch context resets scope").
   */
  const [sidebarSelectMode, setSidebarSelectModeState] = useState(false);
  const [sidebarSelectedIds, setSidebarSelectedIdsState] = useState<string[]>([]);
  /* 'note' while nothing is selected — a kind is only meaningful alongside ids,
     and a null here would make every read branch on emptiness twice. */
  const [sidebarSelectionKind, setSidebarSelectionKindState] =
    useState<SidebarSelectionKind>('note');

  /**
   * Leave select mode and drop the selection.
   *
   * Called from every setter below that changes which notes the list is showing. A
   * selection that outlives the list it was made in is how someone deletes the wrong five
   * things — the ids stay valid, so nothing would fail loudly.
   */
  const exitSidebarSelectMode = useCallback(() => {
    setSidebarSelectModeState(false);
    setSidebarSelectedIdsState([]);
  }, []);

  const setSidebarSelectMode = useCallback((on: boolean) => {
    setSidebarSelectModeState(on);
    if (!on) setSidebarSelectedIdsState([]);
  }, []);

  const setSidebarSelection = useCallback((kind: SidebarSelectionKind, ids: string[]) => {
    setSidebarSelectionKindState(kind);
    setSidebarSelectedIdsState(ids);
  }, []);

  const setLocation = useCallback((next: ProtoLocation) => {
    /*
      Only on a real move. Tools belong to the context that opened them — a
      church planner left hanging over My Home would be pointing at an org you
      just left — but several callers re-assert the location they are already
      at (the space switcher naming the current church, the note page following
      `?space=`), and closing on those dismissed a planner the moment it opened.
    */
    const movedContext = !isSameLocation(locationRef.current, next);
    setLocationState((prev) => (isSameLocation(prev, next) ? prev : next));
    if (movedContext) closeExpandedSidebar();

    const { activeSpaceId: nextSpaceId, activeChurchOrgId: nextOrgId } =
      storedPairFromLocation(next);
    writePersistedSidebarNav({
      layer: 'space',
      clearSidebarListSpaceScope: true,
      ...(nextSpaceId ? { activeSpaceId: nextSpaceId } : { clearActiveSpaceId: true }),
      ...(nextOrgId ? { activeChurchOrgId: nextOrgId } : { clearActiveChurchOrgId: true }),
    });

    exitSidebarSelectMode();
    setSidebarListSpaceScopeState('space');
    clearPersistedDrilldowns();
    setSidebarFolderDrilldownState(undefined);
    setSidebarThreadDrilldownIdState(undefined);
    setScriptureDrillState({ level: 'books' });
    setSidebarLayerState('space');
  }, [closeExpandedSidebar, exitSidebarSelectMode]);

  /**
   * Compatibility shim for callers that only know a space id. Prefer
   * `setLocation` with a parent derived from the space (`locationForSpace`) —
   * this cannot know whether `spaceId` belongs to a church, so it keeps the
   * current parent, and `null` returns to My Home.
   */
  const setActiveSpaceId = useCallback(
    (spaceId: string | null) => {
      setLocation(
        spaceId ? { parent: locationRef.current.parent, spaceId } : HOME_LOCATION,
      );
    },
    [setLocation],
  );

  /** Enter/leave a church parent, landing on its hub. */
  const setActiveChurchOrgId = useCallback(
    (orgId: string | null) => {
      setLocation(orgId ? { parent: churchParent(orgId), spaceId: null } : HOME_LOCATION);
    },
    [setLocation],
  );
  const setSidebarListSpaceScope = useCallback((scope: SidebarListSpaceScope) => {
    setSidebarListSpaceScopeState((prev) => {
      if (prev === scope) return prev;
      exitSidebarSelectMode();
      clearPersistedDrilldowns();
      setSidebarFolderDrilldownState(undefined);
      setSidebarThreadDrilldownIdState(undefined);
      setScriptureDrillState({ level: 'books' });
      writePersistedSidebarNav({ clearFolderDrill: true, clearThreadDrill: true, clearScriptureDrill: true });
      if (scope === 'space') {
        writePersistedSidebarNav({ clearSidebarListSpaceScope: true });
      } else {
        writePersistedSidebarNav({ sidebarListSpaceScope: scope });
      }
      return scope;
    });
  }, [exitSidebarSelectMode]);
  const setSidebarFolderDrilldown = useCallback((value: SidebarFolderDrilldown) => {
    exitSidebarSelectMode();
    setSidebarFolderDrilldownState(value);
    writePersistedSidebarNav({ folderDrill: value });
  }, [exitSidebarSelectMode]);
  const setSidebarThreadDrilldownId = useCallback((id: string | undefined) => {
    setSidebarThreadDrilldownIdState(id);
    if (id) {
      writePersistedSidebarNav({ threadDrillId: id });
    } else {
      writePersistedSidebarNav({ clearThreadDrill: true });
    }
  }, []);
  const setScriptureDrill = useCallback((value: ScriptureDrillState) => {
    exitSidebarSelectMode();
    setScriptureDrillState(value);
    writePersistedSidebarNav({ scriptureDrill: value });
  }, [exitSidebarSelectMode]);
  const setSidebarListMode = useCallback(
    (mode: SidebarListMode) => {
      exitSidebarSelectMode();
      setSidebarListModeState(mode);
      // Picking a list mode always lands on the list layer (flips out of Home).
      setSidebarLayer('list');
      try {
        localStorage.setItem(SIDEBAR_LIST_MODE_STORAGE_KEY, mode);
      } catch {
        /* ignore */
      }
      if (mode !== 'folders') setSidebarFolderDrilldown(undefined);
      if (mode !== 'threads') setSidebarThreadDrilldownId(undefined);
      if (mode !== 'scripture') {
        setScriptureDrillState({ level: 'books' });
        writePersistedSidebarNav({ clearScriptureDrill: true });
      }
    },
    [exitSidebarSelectMode, setSidebarFolderDrilldown, setSidebarLayer, setSidebarThreadDrilldownId],
  );
  const clearSidebarTagSearchIntent = useCallback(() => {
    setSidebarTagSearchIntent(null);
  }, []);

  useEffect(
    () => () => {
      if (sidebarExitTimerRef.current) clearTimeout(sidebarExitTimerRef.current);
      if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
      if (threadPanelExitTimerRef.current) clearTimeout(threadPanelExitTimerRef.current);
      if (expandedSidebarExitTimerRef.current) clearTimeout(expandedSidebarExitTimerRef.current);
    },
    [],
  );
  const closeStudyThreadPopover = useCallback(() => {
    setStudyThreadPopoverOpen(false);
  }, []);

  const openStudyThreadPopover = useCallback(() => {
    setStudyThreadPopoverOpen(true);
  }, []);

  const closeInspector = useCallback(() => {
    if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
    closeStudyThreadPopover();
    setInspectorExiting(true);
    inspectorExitTimerRef.current = setTimeout(() => {
      setInspectorOpen(false);
      setInspectorExiting(false);
    }, PROTO_PANEL_EXIT_MS);
  }, [closeStudyThreadPopover]);

  const openInspector = useCallback(() => {
    if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
    setInspectorExiting(false);
    setInspectorOpen(true);
    // Right-panel slot is mutually exclusive — drop the thread panel if it's up.
    if (threadPanelExitTimerRef.current) clearTimeout(threadPanelExitTimerRef.current);
    setThreadPanelExiting(false);
    setThreadPanelNoteId(null);
    // Mobile: one overlay at a time — sidebar drawer yields to the inspector.
    if (isMobileSidebar && drawerOpen) closeDrawer();
  }, [closeDrawer, drawerOpen, isMobileSidebar]);

  const pushThreadPanelExpandedHistory = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.[THREAD_PANEL_HISTORY_FLAG]) return;
    window.history.pushState({ ...(state ?? {}), [THREAD_PANEL_HISTORY_FLAG]: true }, '');
  }, []);

  const popThreadPanelExpandedHistory = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = window.history.state as Record<string, unknown> | null;
    if (!state?.[THREAD_PANEL_HISTORY_FLAG]) return;
    threadPanelHistorySkipRef.current = true;
    window.history.back();
  }, []);

  const openThreadPanel = useCallback(
    (noteId: string, options?: { expanded?: boolean }) => {
      const expanded = options?.expanded ?? true;
      if (threadPanelExitTimerRef.current) clearTimeout(threadPanelExitTimerRef.current);
      setThreadPanelExiting(false);
      setThreadPanelNoteId(noteId);
      setThreadPanelExpanded(expanded);
      if (expanded) pushThreadPanelExpandedHistory();
      // Close the inspector — both occupy the right-panel slot.
      if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
      setInspectorExiting(false);
      setInspectorOpen(false);
    },
    [pushThreadPanelExpandedHistory],
  );

  const beginThreadPanelClose = useCallback(() => {
    if (threadPanelExitTimerRef.current) clearTimeout(threadPanelExitTimerRef.current);
    setThreadPanelExiting(true);
    threadPanelExitTimerRef.current = setTimeout(() => {
      setThreadPanelNoteId(null);
      setThreadPanelExiting(false);
      setThreadPanelExpanded(false);
      threadPanelExitTimerRef.current = null;
    }, PROTO_PANEL_EXIT_MS);
  }, []);

  const closeThreadPanel = useCallback(() => {
    if (threadPanelExitTimerRef.current) clearTimeout(threadPanelExitTimerRef.current);
    const state =
      typeof window !== 'undefined' ? (window.history.state as Record<string, unknown> | null) : null;
    if (state?.[THREAD_PANEL_HISTORY_FLAG]) {
      threadPanelHistorySkipRef.current = true;
      window.history.back();
    }
    setThreadPanelExpanded(false);
    beginThreadPanelClose();
  }, [beginThreadPanelClose]);

  const dismissMobileRightPanels = useCallback(() => {
    if (!isMobileSidebar) return;
    if (inspectorOpen || inspectorExiting) closeInspector();
    if (threadPanelNoteId || threadPanelExiting) closeThreadPanel();
  }, [
    closeInspector,
    closeThreadPanel,
    inspectorExiting,
    inspectorOpen,
    isMobileSidebar,
    threadPanelExiting,
    threadPanelNoteId,
  ]);

  const toggleDrawer = useCallback(() => {
    if (!drawerOpen) {
      dismissMobileRightPanels();
      cancelSidebarExit();
      pushMobileDrawerHistory();
      setDrawerOpen(true);
      return;
    }
    popMobileDrawerHistory();
    setDrawerOpen((prev) => {
      if (!prev) return false;
      beginSidebarClose(() => setDrawerOpen(false));
      return true;
    });
  }, [
    beginSidebarClose,
    cancelSidebarExit,
    dismissMobileRightPanels,
    drawerOpen,
    popMobileDrawerHistory,
    pushMobileDrawerHistory,
  ]);

  const openDrawer = useCallback(() => {
    dismissMobileRightPanels();
    cancelSidebarExit();
    pushMobileDrawerHistory();
    setDrawerOpen(true);
  }, [cancelSidebarExit, dismissMobileRightPanels, pushMobileDrawerHistory]);

  const ensureSidebarExpanded = useCallback(() => {
    cancelSidebarExit();
    /* Every toolbar orb that asks for a sidebar view routes through here, and the
       expanded tool sits over the sidebar's footprint. Leaving it open meant the orb
       appeared to do nothing — the requested view was rendered underneath a panel that
       was still covering it. Collapsing it is the mirror of collapseDesktopSidebar,
       which already takes the tool with it for the same anchoring reason. */
    closeExpandedSidebar();
    if (isMobileSidebar) {
      dismissMobileRightPanels();
      pushMobileDrawerHistory();
      setDrawerOpen(true);
    } else {
      setDesktopSidebarCollapsed(false);
    }
  }, [
    cancelSidebarExit,
    closeExpandedSidebar,
    dismissMobileRightPanels,
    isMobileSidebar,
    pushMobileDrawerHistory,
  ]);

  const openSidebarTagSearch = useCallback(
    (intent: SidebarTagSearchIntent) => {
      setSidebarTagSearchIntent(intent);
      setSidebarListMode('notes');
      ensureSidebarExpanded();
    },
    [setSidebarListMode, ensureSidebarExpanded],
  );

  const expandThreadPanel = useCallback(() => {
    setThreadPanelExpanded(true);
    pushThreadPanelExpandedHistory();
  }, [pushThreadPanelExpandedHistory]);

  const backFromThreadPanelToInspector = useCallback(
    (options?: { popHistory?: boolean }) => {
      if (options?.popHistory !== false) popThreadPanelExpandedHistory();
      setThreadPanelExpanded(false);
      if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
      setInspectorExiting(false);
      setInspectorOpen(true);
      beginThreadPanelClose();
    },
    [beginThreadPanelClose, popThreadPanelExpandedHistory],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPopState = () => {
      if (drawerHistorySkipRef.current) {
        drawerHistorySkipRef.current = false;
        return;
      }
      if (threadPanelHistorySkipRef.current) {
        threadPanelHistorySkipRef.current = false;
        return;
      }
      if (expandedSidebarHistorySkipRef.current) {
        expandedSidebarHistorySkipRef.current = false;
        return;
      }
      const state = window.history.state as Record<string, unknown> | null;
      /* Back out of the tool before the drawer branch below runs: on mobile both
         flags are on the stack, and popping the tool's must not read as the
         drawer's dismissal too. */
      if (expandedSidebarToolRef.current && !state?.[EXPANDED_SIDEBAR_HISTORY_FLAG]) {
        beginExpandedSidebarClose();
        return;
      }
      if (state?.[MOBILE_DRAWER_HISTORY_FLAG]) {
        cancelSidebarExit();
        setDrawerOpen(true);
      } else if (drawerOpenRef.current) {
        setDrawerOpen((prev) => {
          if (!prev) return false;
          beginSidebarClose(() => setDrawerOpen(false));
          return true;
        });
      }
      if (
        threadPanelExpandedRef.current &&
        !state?.[THREAD_PANEL_HISTORY_FLAG]
      ) {
        backFromThreadPanelToInspector({ popHistory: false });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [backFromThreadPanelToInspector, beginExpandedSidebarClose, beginSidebarClose, cancelSidebarExit]);

  const toggleInspector = useCallback(() => {
    setInspectorOpen((prev) => {
      if (prev) {
        // Closing — trigger exit animation
        if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
        closeStudyThreadPopover();
        setInspectorExiting(true);
        inspectorExitTimerRef.current = setTimeout(() => {
          setInspectorOpen(false);
          setInspectorExiting(false);
        }, PROTO_PANEL_EXIT_MS);
        // Return true to keep open until timer fires
        return true;
      }
      // Opening — cancel any in-progress exit; mobile drawer yields to inspector.
      if (isMobileSidebar && drawerOpen) closeDrawer();
      if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
      setInspectorExiting(false);
      return true;
    });
  }, [closeDrawer, closeStudyThreadPopover, drawerOpen, isMobileSidebar]);
  const setPrototypeFolderChip = useCallback((value: PrototypeFolderChip | null) => {
    setPrototypeFolderChipState((prev) => (prototypeFolderChipsEqual(prev, value) ? prev : value));
  }, []);
  const setComposePersistedNoteId = useCallback((noteId: string | null) => {
    // Null means the compose session no longer needs refresh protection — either the URL
    // just became /{id} (which survives refresh on its own) or the session was reset.
    // Clearing here, at the single choke point every null-path goes through, is what
    // keeps a stale stash from bouncing a deliberate Home visit into an old note.
    if (noteId === null) clearComposeRestoreStash();
    setComposePersistedNoteIdState((prev) => (prev === noteId ? prev : noteId));
    if (noteId) {
      setComposeTargetSpaceIdOverrideState(null);
    }
  }, []);
  const clearComposeTargetSpaceIdOverride = useCallback(() => {
    setComposeTargetSpaceIdOverrideState(null);
  }, []);
  /**
   * Change an in-progress draft's destination. Needed so the compose header's
   * destination control is a real choice, and so a draft retargets on a space
   * switch rather than being closed like a saved note.
   */
  const setComposeTargetSpaceId = useCallback((spaceId: string | null) => {
    const target = spaceId?.trim();
    setComposeTargetSpaceIdOverrideState(
      target ? (target.startsWith('space_') ? target : `space_${target}`) : null,
    );
  }, []);
  const clearComposeDraftActive = useCallback(() => {
    setComposeDraftActive(false);
  }, []);
  const beginPrototypeComposeSession = useCallback(
    (options?: { targetSpaceId?: string; seed?: PrototypeComposeSeed }) => {
      // Synchronous, at click time — see shouldClearStaleComposeDraftOnSessionStart. The
      // equivalent clear in resetComposeSessionState runs in a passive effect, which React
      // commits *after* the remounted editor's layout effect has already restored the draft.
      if (shouldClearStaleComposeDraftOnSessionStart(composeSessionEpochRef.current)) {
        clearNoteDraft(PROTOTYPE_DRAFT_NOTE_ID);
      }
      setComposePersistedNoteIdState(null);
      setComposeDraftActive(true);
      const target = options?.targetSpaceId?.trim();
      setComposeGroupThreadId(null);
      setComposeTargetSpaceIdOverrideState(
        target ? (target.startsWith('space_') ? target : `space_${target}`) : null,
      );
      // Advance via the ref, not a state updater: StrictMode double-invokes updaters, so
      // deriving `next` from `prev` inside one would skip an epoch (and desync the ref).
      const next = composeSessionEpochRef.current + 1;
      composeSessionEpochRef.current = next;
      setComposeSessionEpoch(next);
      // Stamped with the epoch it was created for, and set in the same synchronous pass, so
      // the editor that mounts for *this* session is the only one that can read it.
      setComposeSeedState(options?.seed ? { seed: options.seed, epoch: next } : null);
      return next;
    },
    [],
  );
  /**
   * Epoch-gated read. A seed belongs to exactly one compose session; once the epoch moves on it
   * reads as absent, so it can never surface in a later note. Same guard shape as
   * `liveNoteSnapshot`, and the reason a seed is safe where a compose *draft* was not.
   */
  const composeSeed = resolveComposeSeed(composeSeedState, composeSessionEpoch);

  const openStandaloneScripturePassage = useCallback((value: StandaloneScripturePassageState) => {
    setStandaloneScripturePassage(value);
  }, []);
  const dismissStandaloneScripturePassage = useCallback(() => {
    setStandaloneScripturePassage(null);
  }, []);

  const stackNote = useCallback((origin: PaperStackOrigin, noteId?: string) => {
    setPaperStack({ origin, noteId, open: true });
  }, []);
  const setStackSheetOpen = useCallback((open: boolean) => {
    setPaperStack((current) => (current ? { ...current, open } : current));
  }, []);
  const adoptStackNoteId = useCallback((noteId: string) => {
    setPaperStack((current) => (current && !current.noteId ? { ...current, noteId } : current));
  }, []);
  /**
   * Point a parked stack's origin at the chapter now being read.
   *
   * The origin is captured when the note is stacked, and while the note is UP that capture is
   * the whole anchor rule — read on, flip back, and you return to where you started. Parked is
   * the opposite situation: the reader in front IS what you are doing, so an origin still
   * naming the chapter you left three chapters ago is a breadcrumb to nowhere, and flipping the
   * note back up would throw away the browsing it was parked for.
   */
  const retargetStackOrigin = useCallback(
    (base: { book: string; chapter: number; translation: string }, returnTo: PaperStackReturnTo) => {
      setPaperStack((current) => {
        if (!current || current.origin.kind !== 'reader' || current.origin.base.type !== 'reader') {
          return current;
        }
        const at = current.origin.base;
        if (at.book === base.book && at.chapter === base.chapter && at.translation === base.translation) {
          return current;
        }
        return {
          ...current,
          origin: {
            ...current.origin,
            label: `${base.book} ${base.chapter}`,
            base: { ...at, ...base, fromVerse: undefined },
            returnTo,
          },
        };
      });
    },
    [],
  );

  const setStackNoteTitle = useCallback((noteTitle: string) => {
    setPaperStack((current) =>
      current && current.noteTitle !== noteTitle ? { ...current, noteTitle } : current,
    );
  }, []);
  const clearPaperStack = useCallback(() => {
    setPaperStack(null);
  }, []);

  const value = useMemo(
    () => ({
      drawerOpen,
      toggleDrawer,
      openDrawer,
      closeDrawer,
      isMobileSidebar,
      desktopSidebarCollapsed,
      sidebarExiting,
      toggleDesktopSidebar,
      sidebarWidth,
      setSidebarWidth,
      persistSidebarWidth,
      sidebarWidthMin: PROTO_SIDEBAR_WIDTH_MIN,
      sidebarWidthMax: PROTO_SIDEBAR_WIDTH_MAX,
      sidebarLayer,
      setSidebarLayer,
      location,
      setLocation,
      activeSpaceId,
      setActiveSpaceId,
      activeChurchOrgId,
      setActiveChurchOrgId,
      sidebarListSpaceScope,
      setSidebarListSpaceScope,
      sidebarSelectMode,
      setSidebarSelectMode,
      sidebarSelectionKind,
      sidebarSelectedIds,
      setSidebarSelection,
      sidebarListMode,
      setSidebarListMode,
      sidebarFolderDrilldown,
      setSidebarFolderDrilldown,
      sidebarThreadDrilldownId,
      setSidebarThreadDrilldownId,
      scriptureDrill,
      setScriptureDrill,
      sidebarThreadProposal,
      setSidebarThreadProposal,
      ensureSidebarExpanded,
      sidebarTagSearchIntent,
      openSidebarTagSearch,
      clearSidebarTagSearchIntent,
      inspectorOpen,
      inspectorExiting,
      toggleInspector,
      openInspector,
      closeInspector,
      studyThreadPopoverOpen,
      openStudyThreadPopover,
      closeStudyThreadPopover,
      threadPanelNoteId,
      threadPanelExiting,
      threadPanelExpanded,
      openThreadPanel,
      closeThreadPanel,
      expandThreadPanel,
      backFromThreadPanelToInspector,
      expandedSidebarTool,
      expandedSidebarExiting,
      openExpandedSidebar,
      closeExpandedSidebar,
      setPrototypeFolderChip,
      composePersistedNoteId,
      setComposePersistedNoteId,
      composeDraftActive,
      clearComposeDraftActive,
      composeSessionEpoch,
      composeSeed,
      composeTargetSpaceIdOverride,
      clearComposeTargetSpaceIdOverride,
      setComposeTargetSpaceId,
      beginPrototypeComposeSession,
      standaloneScripturePassage,
      openStandaloneScripturePassage,
      dismissStandaloneScripturePassage,
      paperStack,
      stackNote,
      setStackSheetOpen,
      adoptStackNoteId,
      setStackNoteTitle,
      retargetStackOrigin,
      clearPaperStack,
      editorChromeMode,
      setEditorChromeMode,
      formatToolbarHostEl,
      setFormatToolbarHostEl,
      studyDockCarouselHostEl,
      setStudyDockCarouselHostEl,
      hideSidebar,
      setHideSidebar,
    }),
    [
      drawerOpen,
      toggleDrawer,
      openDrawer,
      closeDrawer,
      isMobileSidebar,
      desktopSidebarCollapsed,
      sidebarExiting,
      toggleDesktopSidebar,
      sidebarWidth,
      setSidebarWidth,
      persistSidebarWidth,
      sidebarLayer,
      setSidebarLayer,
      location,
      setLocation,
      activeSpaceId,
      setActiveSpaceId,
      activeChurchOrgId,
      setActiveChurchOrgId,
      sidebarListSpaceScope,
      setSidebarListSpaceScope,
      sidebarSelectMode,
      setSidebarSelectMode,
      sidebarSelectionKind,
      sidebarSelectedIds,
      setSidebarSelection,
      sidebarListMode,
      setSidebarListMode,
      sidebarFolderDrilldown,
      setSidebarFolderDrilldown,
      sidebarThreadDrilldownId,
      setSidebarThreadDrilldownId,
      scriptureDrill,
      setScriptureDrill,
      sidebarThreadProposal,
      ensureSidebarExpanded,
      sidebarTagSearchIntent,
      openSidebarTagSearch,
      clearSidebarTagSearchIntent,
      inspectorOpen,
      inspectorExiting,
      toggleInspector,
      openInspector,
      closeInspector,
      studyThreadPopoverOpen,
      openStudyThreadPopover,
      closeStudyThreadPopover,
      threadPanelNoteId,
      threadPanelExiting,
      threadPanelExpanded,
      openThreadPanel,
      closeThreadPanel,
      expandThreadPanel,
      backFromThreadPanelToInspector,
      expandedSidebarTool,
      expandedSidebarExiting,
      openExpandedSidebar,
      closeExpandedSidebar,
      setPrototypeFolderChip,
      composePersistedNoteId,
      setComposePersistedNoteId,
      composeDraftActive,
      clearComposeDraftActive,
      composeSessionEpoch,
      composeSeed,
      composeTargetSpaceIdOverride,
      clearComposeTargetSpaceIdOverride,
      setComposeTargetSpaceId,
      beginPrototypeComposeSession,
      standaloneScripturePassage,
      openStandaloneScripturePassage,
      dismissStandaloneScripturePassage,
      paperStack,
      stackNote,
      setStackSheetOpen,
      adoptStackNoteId,
      setStackNoteTitle,
      retargetStackOrigin,
      clearPaperStack,
      editorChromeMode,
      formatToolbarHostEl,
      studyDockCarouselHostEl,
      hideSidebar,
    ],
  );

  return (
    <ProtoShellContext.Provider value={value}>
      <PrototypeFolderChipContext.Provider value={prototypeFolderChip}>
        {children}
      </PrototypeFolderChipContext.Provider>
    </ProtoShellContext.Provider>
  );
}

export function usePrototypeFolderChip() {
  return useContext(PrototypeFolderChipContext);
}

export function useProtoShell() {
  const ctx = useContext(ProtoShellContext);
  if (!ctx) throw new Error('useProtoShell requires ProtoShellProvider');
  return ctx;
}
