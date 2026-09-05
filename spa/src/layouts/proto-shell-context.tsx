import type { ReviewAnswerEcho } from '@/utils/review-answer-echo';
import type { RecallOpportunityKind } from '@/utils/recall-opportunity-kinds';
import { clearComposeRestoreStash } from '../lib/compose-session-restore';
import {
  readSidebarOpenPreference,
  writeSidebarOpenPreference,
} from '../pages/prototype/proto-sidebar-nav-store';
import { clearNoteDraft } from '@/utils/note-draft-store';
import {
  PROTOTYPE_DRAFT_NOTE_ID,
  resolveComposeSeed,
  shouldClearStaleComposeDraftOnSessionStart,
} from '@/utils/prototype-draft-compose-session';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PROTO_EXPANDED_SIDEBAR_EXIT_MS,
  PROTO_LIBRARY_PANEL_MS,
  PROTO_PANEL_EXIT_MS,
  PROTO_VOTD_SHEET_MOTION_MS,
} from './proto-motion';
import {
  isSameLibraryPanelView,
  type LibraryPanelView,
} from '../pages/prototype/library-panel/library-panel-view';
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
import type { ComposePurpose } from '../lib/compose-purpose';
import { setComposeGroupThreadId } from '../lib/compose-group-thread';

/**
 * Breakpoint sync with prototype-shell.css (899px drawer).
 *
 * The prototype's one mobile breakpoint. `SimplifiedPrototypeLayout`'s keyboard effect and
 * the container queries in prototype-editor.css are all sized against this. Classic uses
 * 1159px (`hooks/useIsMobile.ts`); the two must not be mixed inside one surface, or the shell
 * and the component sitting in it disagree about which layout they are in across a 260px band.
 */
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
  | 'sharedThread'
  /**
   * Several kinds at once — the library panel's "Everything", where a note and a folder can
   * be held together.
   *
   * A real member rather than a marker smuggled in as `'note'`, because the state would
   * otherwise be lying about what it holds and every reader would have to know not to
   * believe it. It also makes the compiler name every switch that has to decide what a mixed
   * selection means, which is the point: the ids for this kind are composite
   * (`${kind}:${id}`), so anything treating them as bare ids is a bug waiting to happen.
   */
  | 'mixed';

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
/** A trigger's box in viewport coordinates — enough for a panel to grow out of it. */
export type ProtoExpandRect = { top: number; left: number; width: number; height: number };

/**
 * The focused element's box, when there is one worth animating from.
 *
 * Zero-sized and disconnected elements are refused rather than returned: a rect of no size
 * makes the panel appear to grow from a point at the top-left of the screen, which is worse
 * than the edge unfurl it falls back to.
 */
function readFocusedElementRect(): ProtoExpandRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !el.isConnected) return null;
  /*
   * `document.activeElement` is `<body>` when nothing is focused, and body is page-sized — so
   * it passes every size check and gives an "origin" bigger than the panel itself. That is not
   * a trigger, it is the absence of one, and the honest answer is null so the edge unfurl
   * takes over.
   */
  if (el === document.body || el === document.documentElement) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

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
  /**
   * The recall suggestion that asked for this note, so finishing it can be reported.
   *
   * Rides the same channel as the provenance fields above, and for the same reason: the
   * moment worth recording is a save that happens long after the tap, on a page that would
   * otherwise have no idea a suggestion was involved. The seed is epoch-gated, so it belongs
   * to exactly one compose session and cannot leak into the next note.
   */
  startedFromRecallOpportunityId?: string;
  startedFromRecallKind?: RecallOpportunityKind;
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
  /**
   * Where the dock band sat when this rect was measured — see `readPaperStackDockPlacement`.
   *
   * The rect is captured when the dock expands and reused when it collapses, and nothing can
   * re-measure the card in between: it is unmounted, and its empty slot has no geometry. This
   * is how the collapse knows the rect is still true.
   */
  dockPlacement: string;
};

export type PaperStackOrigin = {
  kind: 'reader' | 'homeCard' | 'noteDock' | 'reviewCard';
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
  /**
   * The review item this sheet is the answer to.
   *
   * A `reviewCard` origin means the note on screen was opened to answer a question about it, so
   * the edge stops being a way back and becomes the verdict: "I almost had it" / "I recalled it".
   * `attempted` decides which verdicts are offered — someone who wrote something, or said they
   * had it in mind, is judging a real retrieval; someone who revealed cold is not, and gets the
   * single honest answer instead. Snapshotted here rather than read from the dock because the
   * edge renders in the layout, and a keystroke in the dock must not re-render the shell.
   */
  review?: {
    itemId: string;
    attempted: boolean;
    attempt?: string;
    /** Where recall stood before this answer, so the result can say when it crossed into holding. */
    recallState?: string;
    /**
     * The question and what it was about, carried so the result card can recap them.
     *
     * Read from here rather than from `base.title` below: that is a display slot on a union,
     * and a result that depended on how a card happens to be laid out would break the first
     * time the layout changed.
     */
    prompt?: string;
    subject?: string | null;
  };
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

/**
 * The Review dock's own state, which is the reason Review is not a page.
 *
 * It lives here rather than in a route or in the dock component because the card has to outlive
 * both: you can be asked about a note on Activity, open the note, read a chapter, and come back
 * without the question being lost. The host renders outside the router's Outlet, so the card
 * itself never unmounts; this is what tells it which item to show and whether it is open.
 *
 * Deliberately does NOT hold the attempt text. The context value is one large memo, so a
 * keystroke here would re-render every consumer in the shell; the dock keeps its own draft and
 * hands a snapshot to `PaperStackOrigin.review` when it reveals.
 */
/**
 * What just happened, so the dock can say so.
 *
 * Lives on shell state rather than inside the dock because a verdict can be given from the
 * paper stack's edge, and answering there clears the stack synchronously — the card that
 * would show the result is unmounting at the moment the answer lands. The dock, which is
 * always mounted, picks it up from here instead.
 */
export type ReviewDockResult = {
  outcome: 'recalled' | 'almost' | 'revealed';
  /** "Back in 2 weeks", phrased once on the server so web and native cannot drift. */
  label: string;
  recallState: string;
  /** True when this answer is what moved it into "Holding" — worth marking, once. */
  crossedToDurable: boolean;
  /**
   * The verse a rung withheld while asking, shown once the answer is in.
   *
   * Null on every rung that had the verse on screen all along. Putting the words back in order
   * and naming the reference are the two that hide it, and leaving the reader with four
   * shuffled phrases and no verse is not how a review should end.
   */
  verseText?: string | null;
  /** How much of the verse that answer reached. A count; it names no word. */
  reached?: { matched: number; total: number } | null;
  /**
   * The question, as it was asked.
   *
   * The result used to arrive without it, so a card read "The answer / I am the vine; you are
   * the branches." with nothing above it saying what had been asked — and on the rungs keyed to
   * the curated index, "The index has this as / Moses" with no question at all. A recap that
   * leaves out the question is not a recap.
   */
  prompt?: string | null;
  /**
   * Which thing it was about, where the question does not name it.
   *
   * Also where the rungs that deliberately *hid* the subject can finally say it: "say where
   * this is from" cannot name the passage while it is the answer, and has every reason to once
   * the answer is in.
   */
  subject?: string | null;
  /**
   * What the reader submitted, marked.
   *
   * Absent where there is nothing to hand back — the self-judged rungs, where they read the
   * note and said how it went, have no answer for the card to echo.
   */
  echo?: ReviewAnswerEcho | null;
  /**
   * Missed four times after being held. The one moment Review says a thing is not working
   * rather than asking again, so the result carries the item to act on.
   */
  leech?: boolean;
  itemId?: string;
  /**
   * The option that was right, after the last go was spent on a wrong one.
   *
   * Only on the rungs whose answer is one of the options: where the answer is the verse, the
   * verse comes back instead.
   */
  correctAnswer?: string | null;
  /** True when that answer is the curated index's reading rather than the text's or the reader's. */
  fromIndex?: boolean;
  /** Set fresh on each answer so the dock's dwell timer restarts. */
  at: number;
};

export type ReviewDockState = {
  /** Which item is being asked. Null means "whatever is next in the session". */
  itemId: string | null;
  expanded: boolean;
  /** The moment after an answer, cleared once the dock has shown it. */
  lastResult: ReviewDockResult | null;
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
   * Where the Notes half of the toolbar's Notes/Bible switch goes back to — the last
   * non-reader path visited. Null until something records one; callers fall back to home.
   *
   * The provider is deliberately router-free (its test renders it with no router), so the
   * recording happens in `useShellModeNav`, which has the location. Writes of an unchanged
   * path bail out, so the several callers of that hook cannot fight each other.
   */
  lastNotesPath: string | null;
  recordNotesPath: (path: string) => void;
  /**
   * The last *note editor* path — a note route only, never Activity.
   *
   * Distinct from `lastNotesPath`, which is "the last thing that wasn't the reader" and so
   * includes Activity itself. The Note half of the shell switch needs the narrower one: from
   * Activity it should return to the note you had open, and `lastNotesPath` at that moment
   * is Activity, which would make the half a no-op.
   */
  lastNoteEditorPath: string | null;
  recordNoteEditorPath: (path: string) => void;
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
  openExpandedSidebar: (tool: string, origin?: ProtoExpandRect | null) => void;
  /** Where the open came from, for the panel's grow-out-of-it animation. Null = no opener. */
  expandedSidebarOrigin: ProtoExpandRect | null;
  closeExpandedSidebar: (options?: { preserveHistory?: boolean }) => void;
  /**
   * Library panel — the browse surface that morphs out of the toolbar's center chip.
   *
   * `null` is closed. Deliberately NOT sharing the sidebar's list mode or drilldowns:
   * the sidebar survives behind ⇧S this phase and the two must not move each other.
   * See `library-panel-view.ts` for the full reasoning, and why none of this persists.
   */
  libraryPanelView: LibraryPanelView | null;
  /** True during the exit morph — keep the panel mounted while this is true. */
  libraryPanelExiting: boolean;
  /** Open (or re-target) the panel. Pushes one history entry; Back closes it. */
  openLibraryPanel: (view: LibraryPanelView) => void;
  /** Drill within an open panel. No history entry — Back closes the panel, not the drill. */
  setLibraryPanelView: (view: LibraryPanelView) => void;
  closeLibraryPanel: (options?: { preserveHistory?: boolean }) => void;
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
    /** What this note is *for* — see `compose-purpose.ts`. Session-scoped like the seed. */
    purpose?: ComposePurpose;
  }) => number;
  /**
   * Seed for the *current* compose session, or null. Already epoch-checked — a seed left over
   * from a previous session reads as null here rather than leaking into this note.
   */
  composeSeed: PrototypeComposeSeed | null;
  /**
   * Purpose of the *current* compose session, or null — epoch-checked exactly like the seed.
   * It used to be a bare sessionStorage key that nothing consumed, so "Creating a template"
   * followed the reader into every note they started for the rest of the tab.
   */
  composePurpose: ComposePurpose | null;
  /** The intention was fulfilled (template saved) or dismissed: stop showing it for this session. */
  clearComposePurpose: () => void;
  /** Non-null while a sheet is stacked over an origin paper (reader, Home card, note). */
  /**
   * The Review dock — one question, floating at the foot of the pane on every view.
   *
   * Null when closed. `openReviewDock()` with no id means "ask whatever is next".
   */
  reviewDock: ReviewDockState | null;
  openReviewDock: (itemId?: string | null, options?: { expanded?: boolean }) => void;
  closeReviewDock: () => void;
  setReviewDockExpanded: (expanded: boolean) => void;
  /** Move the dock to another item — used when the current one is answered and leaves the queue. */
  setReviewDockItem: (itemId: string | null) => void;
  /** Record what an answer produced, from either verdict path. Null clears the moment. */
  setReviewDockResult: (result: ReviewDockResult | null) => void;
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
  /*
   * Collapsed unless the reader has said otherwise.
   *
   * Activity is the canvas — the sheet is the work, and a browse rail beside it is a second
   * thing competing for the same attention. The sidebar stays one keystroke away (⇧S) and
   * remembers the moment anyone disagrees, so this is a default rather than a decision made
   * on someone's behalf.
   */
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(
    () => readSidebarOpenPreference() !== true,
  );
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
  const [reviewDock, setReviewDock] = useState<ReviewDockState | null>(null);
  const [expandedSidebarTool, setExpandedSidebarTool] = useState<string | null>(null);
  const [expandedSidebarExiting, setExpandedSidebarExiting] = useState(false);
  /**
   * Where the tool was opened from, so the panel can grow out of it.
   *
   * The surface used to unfurl from the left edge at the sidebar's width, which was the truth
   * while the sidebar was the only way in. It is not any more — a tool is reached from a hub's
   * header, a row in a sheet, a step in a plan — and a panel that always came from the same
   * place regardless was animating a door that is no longer there.
   */
  const [expandedSidebarOrigin, setExpandedSidebarOrigin] = useState<ProtoExpandRect | null>(null);
  const expandedSidebarExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Skips the next popstate close when we called history.back() from an explicit close. */
  const expandedSidebarHistorySkipRef = useRef(false);
  const EXPANDED_SIDEBAR_HISTORY_FLAG = 'protoExpandedSidebarTool';
  const expandedSidebarToolRef = useRef(expandedSidebarTool);
  expandedSidebarToolRef.current = expandedSidebarTool;
  const [libraryPanelView, setLibraryPanelViewState] = useState<LibraryPanelView | null>(null);
  const [libraryPanelExiting, setLibraryPanelExiting] = useState(false);
  const libraryPanelExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Skips the next popstate close when we called history.back() from an explicit close. */
  const libraryPanelHistorySkipRef = useRef(false);
  const LIBRARY_PANEL_HISTORY_FLAG = 'protoLibraryPanel';
  const libraryPanelViewRef = useRef(libraryPanelView);
  libraryPanelViewRef.current = libraryPanelView;
  /**
   * Read-side mirror, so the panel's exit timer can pick its duration without the
   * breakpoint becoming a dependency of the close callback — which the popstate effect
   * depends on in turn, and which must not be torn down and re-registered on a resize.
   */
  const isMobileSidebarRef = useRef(isMobileSidebar);
  isMobileSidebarRef.current = isMobileSidebar;
  const [sidebarExiting, setSidebarExiting] = useState(false);
  const sidebarExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sidebarListMode, setSidebarListModeState] = useState<SidebarListMode>(readStoredSidebarListMode);
  const persistedNav = readPersistedSidebarNav();
  const [sidebarLayer, setSidebarLayerState] = useState<SidebarLayer>(persistedNav.layer);
  const [lastNotesPath, setLastNotesPath] = useState<string | null>(null);
  const recordNotesPath = useCallback((path: string) => {
    setLastNotesPath((prev) => (prev === path ? prev : path));
  }, []);
  const [lastNoteEditorPath, setLastNoteEditorPath] = useState<string | null>(null);
  const recordNoteEditorPath = useCallback((path: string) => {
    setLastNoteEditorPath((prev) => (prev === path ? prev : path));
  }, []);
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
  const [composePurposeState, setComposePurposeState] = useState<{
    seed: ComposePurpose;
    epoch: number;
  } | null>(null);
  /**
   * Read-side mirror of the epoch, so `beginPrototypeComposeSession` can branch on it
   * synchronously. It must NOT live inside the `setComposeSessionEpoch` updater — React
   * double-invokes updaters in StrictMode, which would advance it twice per compose.
   */
  const composeSessionEpochRef = useRef(0);
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
    /* Same reasoning as the tool above, and more literally true here: desktop is a panel
       morphing from a toolbar chip, mobile is a bottom sheet. Carrying one across the flip
       lands it mid-animation in geometry that does not exist on the other side. */
    const clearLibraryPanel = () => {
      const state = window.history.state as Record<string, unknown> | null;
      if (state?.[LIBRARY_PANEL_HISTORY_FLAG]) {
        const next = { ...state };
        delete next[LIBRARY_PANEL_HISTORY_FLAG];
        window.history.replaceState(next, '');
      }
      if (libraryPanelExitTimerRef.current) clearTimeout(libraryPanelExitTimerRef.current);
      libraryPanelExitTimerRef.current = null;
      setLibraryPanelViewState(null);
      setLibraryPanelExiting(false);
    };
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => {
      const mobile = mq.matches;
      setIsMobileSidebar(mobile);
      clearExpandedSidebar();
      clearLibraryPanel();
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
    (tool: string, origin?: ProtoExpandRect | null) => {
      if (expandedSidebarExitTimerRef.current) clearTimeout(expandedSidebarExitTimerRef.current);
      expandedSidebarExitTimerRef.current = null;
      setExpandedSidebarExiting(false);
      /*
       * The focused element is the opener, and reading it here rather than threading a rect
       * through six call sites is what makes this hold for the seventh. A pointer press on a
       * button focuses it, so by the time a click handler calls this the trigger is what has
       * focus — and where that is not true (opened from a sheet that has already closed, or
       * from the keyboard with focus elsewhere) the answer is null and the panel keeps the
       * edge unfurl it has always had. Explicit beats implicit, except where implicit is the
       * only version that stays right as call sites are added.
       */
      setExpandedSidebarOrigin(origin ?? readFocusedElementRect());
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

  /**
   * The Library panel answers Back on both breakpoints, same bargain as the expanded
   * tool: it covers the main pane, so Back reading as "close this" is what a reader
   * expects. One entry per open, not per drill — drilling inside the panel uses the
   * header's "Library" tile, and a Back that unwound six folder taps one at a time
   * would make the button useless for leaving.
   */
  const pushLibraryPanelHistory = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.[LIBRARY_PANEL_HISTORY_FLAG]) return;
    window.history.pushState({ ...(state ?? {}), [LIBRARY_PANEL_HISTORY_FLAG]: true }, '');
  }, []);

  const popLibraryPanelHistory = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = window.history.state as Record<string, unknown> | null;
    if (!state?.[LIBRARY_PANEL_HISTORY_FLAG]) return;
    libraryPanelHistorySkipRef.current = true;
    window.history.back();
  }, []);

  const beginLibraryPanelClose = useCallback(() => {
    if (!libraryPanelViewRef.current) return;
    if (libraryPanelExitTimerRef.current) clearTimeout(libraryPanelExitTimerRef.current);
    setLibraryPanelExiting(true);
    /* Two geometries, two durations: the desktop panel morphs back into the chip,
       the mobile sheet slides down. Holding the wrong one either cuts the animation
       off or leaves a dead surface on screen after it finishes. */
    const exitMs = isMobileSidebarRef.current ? PROTO_VOTD_SHEET_MOTION_MS : PROTO_LIBRARY_PANEL_MS;
    libraryPanelExitTimerRef.current = setTimeout(() => {
      setLibraryPanelViewState(null);
      setLibraryPanelExiting(false);
      libraryPanelExitTimerRef.current = null;
    }, exitMs);
  }, []);

  const openLibraryPanel = useCallback(
    (view: LibraryPanelView) => {
      /*
       * Take focus off the note before the panel goes up. A selection's floating bar in the
       * note underneath otherwise stays put, on top of the panel, still offering to act on
       * text nobody is looking at — the editor only drops it on a blur that genuinely
       * leaves (see handleBlur in TiptapEditor), and only the toolbar chip's opener focuses
       * the search, so every other way in left the editor focused. This makes them all the
       * same. On a phone it also puts the keyboard away, which a panel taking over the pane
       * should do regardless.
       */
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('.ProseMirror')) active.blur();
      if (libraryPanelExitTimerRef.current) clearTimeout(libraryPanelExitTimerRef.current);
      libraryPanelExitTimerRef.current = null;
      setLibraryPanelExiting(false);
      setLibraryPanelViewState((prev) =>
        prev && isSameLibraryPanelView(prev, view) ? prev : view,
      );
      /* The expanded tool and the panel are both main-pane overlays; two at once is
         two Backs to get out of and one surface hidden under another. */
      closeExpandedSidebar();
      pushLibraryPanelHistory();
    },
    [closeExpandedSidebar, pushLibraryPanelHistory],
  );

  /** In-panel drill. Opens the panel if it is somehow closed, but never adds history. */
  const setLibraryPanelView = useCallback((view: LibraryPanelView) => {
    if (libraryPanelExitTimerRef.current) clearTimeout(libraryPanelExitTimerRef.current);
    libraryPanelExitTimerRef.current = null;
    setLibraryPanelExiting(false);
    setLibraryPanelViewState((prev) => (prev && isSameLibraryPanelView(prev, view) ? prev : view));
  }, []);

  const closeLibraryPanel = useCallback(
    (options?: { preserveHistory?: boolean }) => {
      if (!libraryPanelViewRef.current) return;
      if (!options?.preserveHistory) popLibraryPanelHistory();
      beginLibraryPanelClose();
    },
    [beginLibraryPanelClose, popLibraryPanelHistory],
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
  /*
   * Only an explicit toggle records a preference.
   *
   * `ensureSidebarExpanded` opens the rail as a side effect of going somewhere — tapping a
   * greeting chip, drilling into a folder — and that is the app answering a question, not
   * the reader stating what they want the sidebar to do. Recording those would turn the
   * first chip anyone taps into a permanent decision.
   */
  const toggleDesktopSidebar = useCallback(() => {
    if (desktopSidebarCollapsed) {
      cancelSidebarExit();
      setDesktopSidebarCollapsed(false);
      writeSidebarOpenPreference(true);
      return;
    }
    writeSidebarOpenPreference(false);
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
    /*
      The Library panel re-scopes where the expanded tool closes, and the difference is
      deliberate: the panel's own header holds the space switcher, so a move is usually
      the reader saying "show me this space's library", not "I am done browsing". Closing
      would dismiss the surface they are steering. Root, rather than the current view,
      because a folder or thread from the space you just left does not exist in this one.
    */
    /* Keep the tab, clear the drill. A folder or thread from the space you just left does
       not exist in this one — but a tab exists in every space, and resetting it discarded
       a choice the reader had only just made. */
    if (movedContext && libraryPanelViewRef.current) {
      setLibraryPanelViewState((prev) => (prev ? { tab: prev.tab, drill: null } : prev));
    }

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
      if (libraryPanelHistorySkipRef.current) {
        libraryPanelHistorySkipRef.current = false;
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
      /* Same ordering rule, same reason: on mobile the sheet's flag sits above the
         drawer's, and letting this fall through would dismiss the drawer underneath
         the sheet the reader was actually closing. */
      if (libraryPanelViewRef.current && !state?.[LIBRARY_PANEL_HISTORY_FLAG]) {
        beginLibraryPanelClose();
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
  }, [
    backFromThreadPanelToInspector,
    beginExpandedSidebarClose,
    beginLibraryPanelClose,
    beginSidebarClose,
    cancelSidebarExit,
  ]);

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
    (options?: {
      targetSpaceId?: string;
      seed?: PrototypeComposeSeed;
      purpose?: ComposePurpose;
    }) => {
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
      setComposePurposeState(options?.purpose ? { seed: options.purpose, epoch: next } : null);
      return next;
    },
    [],
  );
  const clearComposePurpose = useCallback(() => {
    setComposePurposeState(null);
  }, []);
  /**
   * Epoch-gated read. A seed belongs to exactly one compose session; once the epoch moves on it
   * reads as absent, so it can never surface in a later note. Same guard shape as
   * `liveNoteSnapshot`, and the reason a seed is safe where a compose *draft* was not.
   */
  const composeSeed = resolveComposeSeed(composeSeedState, composeSessionEpoch);
  const composePurpose = resolveComposeSeed(composePurposeState, composeSessionEpoch);

  /*
   * Opening with no id keeps whichever item was already up, so the toolbar and a row on the
   * Inbox can both open the dock without one of them silently changing the question.
   *
   * No history entry, unlike `openExpandedSidebar`. The dock is not a place you navigated to —
   * Back should leave the surface you are on, not close a card that is following you around.
   */
  const openReviewDock = useCallback(
    (itemId?: string | null, options?: { expanded?: boolean }) => {
      setReviewDock((current) => ({
        itemId: itemId !== undefined ? itemId : (current?.itemId ?? null),
        expanded: options?.expanded ?? true,
        lastResult: null,
      }));
    },
    [],
  );
  const closeReviewDock = useCallback(() => setReviewDock(null), []);
  const setReviewDockExpanded = useCallback((expanded: boolean) => {
    setReviewDock((current) => (current ? { ...current, expanded } : current));
  }, []);
  const setReviewDockItem = useCallback((itemId: string | null) => {
    setReviewDock((current) => (current ? { ...current, itemId } : current));
  }, []);
  const setReviewDockResult = useCallback((result: ReviewDockResult | null) => {
    // Answering from the stack's edge expands the dock: the card is the only thing left on
    // screen that can show the result, and collapsed it would show nothing at all.
    setReviewDock((current) =>
      current ? { ...current, lastResult: result, expanded: result ? true : current.expanded } : current,
    );
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
      lastNotesPath,
      recordNotesPath,
      lastNoteEditorPath,
      recordNoteEditorPath,
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
      expandedSidebarOrigin,
      openExpandedSidebar,
      closeExpandedSidebar,
      libraryPanelView,
      libraryPanelExiting,
      openLibraryPanel,
      setLibraryPanelView,
      closeLibraryPanel,
      setPrototypeFolderChip,
      composePersistedNoteId,
      setComposePersistedNoteId,
      composeDraftActive,
      clearComposeDraftActive,
      composeSessionEpoch,
      composeSeed,
      composePurpose,
      clearComposePurpose,
      composeTargetSpaceIdOverride,
      clearComposeTargetSpaceIdOverride,
      setComposeTargetSpaceId,
      beginPrototypeComposeSession,
      reviewDock,
      openReviewDock,
      closeReviewDock,
      setReviewDockExpanded,
      setReviewDockItem,
      setReviewDockResult,
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
      lastNotesPath,
      recordNotesPath,
      lastNoteEditorPath,
      recordNoteEditorPath,
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
      expandedSidebarOrigin,
      openExpandedSidebar,
      closeExpandedSidebar,
      libraryPanelView,
      libraryPanelExiting,
      openLibraryPanel,
      setLibraryPanelView,
      closeLibraryPanel,
      setPrototypeFolderChip,
      composePersistedNoteId,
      setComposePersistedNoteId,
      composeDraftActive,
      clearComposeDraftActive,
      composeSessionEpoch,
      composeSeed,
      composePurpose,
      clearComposePurpose,
      composeTargetSpaceIdOverride,
      clearComposeTargetSpaceIdOverride,
      setComposeTargetSpaceId,
      beginPrototypeComposeSession,
      reviewDock,
      openReviewDock,
      closeReviewDock,
      setReviewDockExpanded,
      setReviewDockItem,
      setReviewDockResult,
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
