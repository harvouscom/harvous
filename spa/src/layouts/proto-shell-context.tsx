import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PROTO_PANEL_EXIT_MS } from './proto-motion';

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

export type SidebarListMode = 'notes' | 'folders' | 'highlights' | 'scripture' | 'threads';

/** Sidebar layer — Home space dashboard vs the list views. Only 'space' layer content today is My Home. */
export type SidebarLayer = 'space' | 'list';

/** A proposed thread surfaced from a Home theme card, pending user review/accept. */
export interface ThreadProposal {
  /** Proposed thread title (the theme/subject). */
  subject: string;
  /** Notes that would be connected into the thread. */
  notes: Array<{ id: string; title: string | null }>;
}

const SIDEBAR_LIST_MODE_STORAGE_KEY = 'harvous-prototype-sidebar-list-mode';
const SIDEBAR_LIST_MODE_DEFAULT: SidebarListMode = 'notes';
const VALID_MODES = new Set<SidebarListMode>(['notes', 'folders', 'highlights', 'scripture', 'threads']);

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

/** Scripture-passage highlight opened from Highlights list — main pane shows standalone passage (native dock parity). */
export type StandaloneScripturePassageState = {
  canonicalReference: string;
  translationCode: string;
  focusedHighlightThreadId: string;
};

/** Bottom chrome on note routes — format bar, scripture dock, etc. */
export type PrototypeEditorChromeMode =
  | 'format'
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
  closeDrawer: () => void;
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
  /** Sidebar layer — 'space' shows the Home space view, 'list' shows the list views. Not persisted: fresh loads land on Home. */
  sidebarLayer: SidebarLayer;
  setSidebarLayer: (layer: SidebarLayer) => void;
  /** Notes / folders / highlights / scripture sidebar list mode. */
  sidebarListMode: SidebarListMode;
  setSidebarListMode: (mode: SidebarListMode) => void;
  sidebarFolderDrilldown: SidebarFolderDrilldown;
  setSidebarFolderDrilldown: (value: SidebarFolderDrilldown) => void;
  /** Representative note ID of the drilled thread cluster; undefined = showing cluster list. */
  sidebarThreadDrilldownId: string | undefined;
  setSidebarThreadDrilldownId: (id: string | undefined) => void;
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
  studyThreadPopoverAnchorRect: DOMRect | null;
  openStudyThreadPopover: (anchorRect?: DOMRect | null) => void;
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
  setPrototypeFolderChip: (value: PrototypeFolderChip | null) => void;
  /** Backend note id after first autosave on `/n/new` — before URL replace. */
  composePersistedNoteId: string | null;
  setComposePersistedNoteId: (noteId: string | null) => void;
  /** Bumped on each explicit compose action so `/n/new` gets a fresh editor session. */
  composeSessionEpoch: number;
  beginPrototypeComposeSession: () => number;
  standaloneScripturePassage: StandaloneScripturePassageState | null;
  openStandaloneScripturePassage: (value: StandaloneScripturePassageState) => void;
  dismissStandaloneScripturePassage: () => void;
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
  const [studyThreadPopoverAnchorRect, setStudyThreadPopoverAnchorRect] = useState<DOMRect | null>(null);
  const [threadPanelNoteId, setThreadPanelNoteId] = useState<string | null>(null);
  const [threadPanelExiting, setThreadPanelExiting] = useState(false);
  const [threadPanelExpanded, setThreadPanelExpanded] = useState(false);
  const threadPanelExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Skips the next popstate collapse when we called history.back() from collapse/close. */
  const threadPanelHistorySkipRef = useRef(false);
  const THREAD_PANEL_HISTORY_FLAG = 'protoThreadPanelExpanded';
  const [sidebarExiting, setSidebarExiting] = useState(false);
  const sidebarExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sidebarListMode, setSidebarListModeState] = useState<SidebarListMode>(readStoredSidebarListMode);
  /** Intentionally not persisted — every fresh load lands on the Home space layer. */
  const [sidebarLayer, setSidebarLayer] = useState<SidebarLayer>('space');
  const [sidebarFolderDrilldown, setSidebarFolderDrilldown] = useState<SidebarFolderDrilldown>(undefined);
  const [sidebarThreadDrilldownId, setSidebarThreadDrilldownId] = useState<string | undefined>(undefined);
  /** Transient — a Home theme card's proposed thread awaiting review. Never persisted. */
  const [sidebarThreadProposal, setSidebarThreadProposal] = useState<ThreadProposal | undefined>(undefined);
  const [sidebarTagSearchIntent, setSidebarTagSearchIntent] = useState<SidebarTagSearchIntent | null>(null);
  const [prototypeFolderChip, setPrototypeFolderChipState] = useState<PrototypeFolderChip | null>(null);
  const [composePersistedNoteId, setComposePersistedNoteIdState] = useState<string | null>(null);
  const [composeSessionEpoch, setComposeSessionEpoch] = useState(0);
  const [standaloneScripturePassage, setStandaloneScripturePassage] = useState<StandaloneScripturePassageState | null>(
    null,
  );
  const [editorChromeMode, setEditorChromeMode] = useState<PrototypeEditorChromeMode>('hidden');
  const [formatToolbarHostEl, setFormatToolbarHostEl] = useState<HTMLDivElement | null>(null);
  const [studyDockCarouselHostEl, setStudyDockCarouselHostEl] = useState<HTMLDivElement | null>(null);
  const [hideSidebar, setHideSidebar] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => {
      const mobile = mq.matches;
      setIsMobileSidebar(mobile);
      if (mobile) {
        setDrawerOpen(false);
        setDesktopSidebarCollapsed(false);
        if (sidebarExitTimerRef.current) clearTimeout(sidebarExitTimerRef.current);
        sidebarExitTimerRef.current = null;
        setSidebarExiting(false);
      } else {
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

  const closeDrawer = useCallback(() => {
    setDrawerOpen((prev) => {
      if (!prev) return false;
      beginSidebarClose(() => setDrawerOpen(false));
      return true;
    });
  }, [beginSidebarClose]);
  const collapseDesktopSidebar = useCallback(() => {
    if (desktopSidebarCollapsed || sidebarExiting) return;
    /* Collapse grid immediately so main/editor ease in sync with the panel exit. */
    setDesktopSidebarCollapsed(true);
    beginSidebarClose(() => undefined);
  }, [beginSidebarClose, desktopSidebarCollapsed, sidebarExiting]);
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
  const setSidebarListMode = useCallback((mode: SidebarListMode) => {
    setSidebarListModeState(mode);
    // Picking a list mode always lands on the list layer (flips out of Home).
    setSidebarLayer('list');
    try { localStorage.setItem(SIDEBAR_LIST_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
    if (mode !== 'folders') setSidebarFolderDrilldown(undefined);
    if (mode !== 'threads') setSidebarThreadDrilldownId(undefined);
  }, []);
  const clearSidebarTagSearchIntent = useCallback(() => {
    setSidebarTagSearchIntent(null);
  }, []);

  useEffect(
    () => () => {
      if (sidebarExitTimerRef.current) clearTimeout(sidebarExitTimerRef.current);
      if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
      if (threadPanelExitTimerRef.current) clearTimeout(threadPanelExitTimerRef.current);
    },
    [],
  );
  const closeStudyThreadPopover = useCallback(() => {
    setStudyThreadPopoverOpen(false);
    setStudyThreadPopoverAnchorRect(null);
  }, []);

  const openStudyThreadPopover = useCallback((anchorRect: DOMRect | null = null) => {
    setStudyThreadPopoverAnchorRect(anchorRect);
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
    if (!drawerOpen) dismissMobileRightPanels();
    setDrawerOpen((prev) => {
      if (prev) {
        beginSidebarClose(() => setDrawerOpen(false));
        return true;
      }
      cancelSidebarExit();
      return true;
    });
  }, [beginSidebarClose, cancelSidebarExit, dismissMobileRightPanels, drawerOpen]);

  const openDrawer = useCallback(() => {
    dismissMobileRightPanels();
    cancelSidebarExit();
    setDrawerOpen(true);
  }, [cancelSidebarExit, dismissMobileRightPanels]);

  const ensureSidebarExpanded = useCallback(() => {
    cancelSidebarExit();
    if (isMobileSidebar) {
      dismissMobileRightPanels();
      setDrawerOpen(true);
    } else {
      setDesktopSidebarCollapsed(false);
    }
  }, [cancelSidebarExit, dismissMobileRightPanels, isMobileSidebar]);

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
      if (threadPanelHistorySkipRef.current) {
        threadPanelHistorySkipRef.current = false;
        return;
      }
      backFromThreadPanelToInspector({ popHistory: false });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [backFromThreadPanelToInspector]);

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
    setComposePersistedNoteIdState((prev) => (prev === noteId ? prev : noteId));
  }, []);
  const beginPrototypeComposeSession = useCallback(() => {
    setComposePersistedNoteIdState(null);
    let next = 0;
    setComposeSessionEpoch((prev) => {
      next = prev + 1;
      return next;
    });
    return next;
  }, []);
  const openStandaloneScripturePassage = useCallback((value: StandaloneScripturePassageState) => {
    setStandaloneScripturePassage(value);
  }, []);
  const dismissStandaloneScripturePassage = useCallback(() => {
    setStandaloneScripturePassage(null);
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
      sidebarListMode,
      setSidebarListMode,
      sidebarFolderDrilldown,
      setSidebarFolderDrilldown,
      sidebarThreadDrilldownId,
      setSidebarThreadDrilldownId,
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
      studyThreadPopoverAnchorRect,
      openStudyThreadPopover,
      closeStudyThreadPopover,
      threadPanelNoteId,
      threadPanelExiting,
      threadPanelExpanded,
      openThreadPanel,
      closeThreadPanel,
      expandThreadPanel,
      backFromThreadPanelToInspector,
      setPrototypeFolderChip,
      composePersistedNoteId,
      setComposePersistedNoteId,
      composeSessionEpoch,
      beginPrototypeComposeSession,
      standaloneScripturePassage,
      openStandaloneScripturePassage,
      dismissStandaloneScripturePassage,
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
      sidebarListMode,
      setSidebarListMode,
      sidebarFolderDrilldown,
      setSidebarFolderDrilldown,
      sidebarThreadDrilldownId,
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
      studyThreadPopoverAnchorRect,
      openStudyThreadPopover,
      closeStudyThreadPopover,
      threadPanelNoteId,
      threadPanelExiting,
      threadPanelExpanded,
      openThreadPanel,
      closeThreadPanel,
      expandThreadPanel,
      backFromThreadPanelToInspector,
      setPrototypeFolderChip,
      composePersistedNoteId,
      setComposePersistedNoteId,
      composeSessionEpoch,
      beginPrototypeComposeSession,
      standaloneScripturePassage,
      openStandaloneScripturePassage,
      dismissStandaloneScripturePassage,
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
