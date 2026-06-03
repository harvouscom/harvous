import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** Breakpoint sync with prototype-shell.css (899px drawer). */
const MOBILE_MQ = '(max-width: 899px)';
const PROTO_SIDEBAR_WIDTH_STORAGE_KEY = 'harvous-prototype-sidebar-width';
export const PROTO_SIDEBAR_WIDTH_DEFAULT = 280;
export const PROTO_SIDEBAR_WIDTH_MIN = 250;
export const PROTO_SIDEBAR_WIDTH_MAX = 420;

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

export type SidebarListMode = 'notes' | 'folders' | 'highlights' | 'scripture' | 'dictionary';

/** `undefined` = top-level list; `null` = “No folder” drill-down; `string` = named folder. */
export type SidebarFolderDrilldown = string | null | undefined;

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
  /** Notes / folders / highlights / scripture sidebar list mode. */
  sidebarListMode: SidebarListMode;
  setSidebarListMode: (mode: SidebarListMode) => void;
  sidebarFolderDrilldown: SidebarFolderDrilldown;
  setSidebarFolderDrilldown: (value: SidebarFolderDrilldown) => void;
  /** Active dictionary entry slug when drilled into a Easton's entry in the sidebar. */
  sidebarDictionarySlug: string | undefined;
  setSidebarDictionarySlug: (slug: string | undefined) => void;
  /** Open mobile drawer or expand desktop sidebar so the list is visible. */
  ensureSidebarExpanded: () => void;
  /** Inspector pane — desktop: inline column; mobile: slide-over on note page. */
  inspectorOpen: boolean;
  /** True during the exit animation window — keep the panel mounted while this is true. */
  inspectorExiting: boolean;
  toggleInspector: () => void;
  openInspector: () => void;
  closeInspector: () => void;
  setPrototypeFolderChip: (value: PrototypeFolderChip | null) => void;
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
  referenceChromeHostEl: HTMLDivElement | null;
  setReferenceChromeHostEl: (el: HTMLDivElement | null) => void;
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
  const [sidebarExiting, setSidebarExiting] = useState(false);
  const sidebarExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sidebarListMode, setSidebarListModeState] = useState<SidebarListMode>('notes');
  const [sidebarFolderDrilldown, setSidebarFolderDrilldown] = useState<SidebarFolderDrilldown>(undefined);
  const [sidebarDictionarySlug, setSidebarDictionarySlug] = useState<string | undefined>(undefined);
  const [prototypeFolderChip, setPrototypeFolderChipState] = useState<PrototypeFolderChip | null>(null);
  const [standaloneScripturePassage, setStandaloneScripturePassage] = useState<StandaloneScripturePassageState | null>(
    null,
  );
  const [editorChromeMode, setEditorChromeMode] = useState<PrototypeEditorChromeMode>('hidden');
  const [formatToolbarHostEl, setFormatToolbarHostEl] = useState<HTMLDivElement | null>(null);
  const [studyDockCarouselHostEl, setStudyDockCarouselHostEl] = useState<HTMLDivElement | null>(null);
  const [referenceChromeHostEl, setReferenceChromeHostEl] = useState<HTMLDivElement | null>(null);
  const [hideSidebar, setHideSidebar] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => {
      const mobile = mq.matches;
      setIsMobileSidebar(mobile);
      setDrawerOpen(!mobile ? true : false);
      if (!mobile) setDesktopSidebarCollapsed(false);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** Duration must match sidebar exit CSS (260ms — same as inspector). */
  const SIDEBAR_EXIT_MS = 260;

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
      }, SIDEBAR_EXIT_MS);
    },
    [],
  );

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => {
      if (prev) {
        beginSidebarClose(() => setDrawerOpen(false));
        return true;
      }
      cancelSidebarExit();
      return true;
    });
  }, [beginSidebarClose, cancelSidebarExit]);
  const openDrawer = useCallback(() => {
    cancelSidebarExit();
    setDrawerOpen(true);
  }, [cancelSidebarExit]);
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
    if (mode !== 'folders') setSidebarFolderDrilldown(undefined);
    if (mode !== 'dictionary') setSidebarDictionarySlug(undefined);
  }, []);
  const ensureSidebarExpanded = useCallback(() => {
    cancelSidebarExit();
    if (isMobileSidebar) setDrawerOpen(true);
    else setDesktopSidebarCollapsed(false);
  }, [cancelSidebarExit, isMobileSidebar]);

  useEffect(
    () => () => {
      if (sidebarExitTimerRef.current) clearTimeout(sidebarExitTimerRef.current);
      if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
    },
    [],
  );
  /** Duration must match the CSS exit animation length (260ms). */
  const INSPECTOR_EXIT_MS = 260;

  const closeInspector = useCallback(() => {
    if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
    setInspectorExiting(true);
    inspectorExitTimerRef.current = setTimeout(() => {
      setInspectorOpen(false);
      setInspectorExiting(false);
    }, INSPECTOR_EXIT_MS);
  }, []);

  const openInspector = useCallback(() => {
    if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
    setInspectorExiting(false);
    setInspectorOpen(true);
  }, []);

  const toggleInspector = useCallback(() => {
    setInspectorOpen((prev) => {
      if (prev) {
        // Closing — trigger exit animation
        if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
        setInspectorExiting(true);
        inspectorExitTimerRef.current = setTimeout(() => {
          setInspectorOpen(false);
          setInspectorExiting(false);
        }, INSPECTOR_EXIT_MS);
        // Return true to keep open until timer fires
        return true;
      }
      // Opening — cancel any in-progress exit
      if (inspectorExitTimerRef.current) clearTimeout(inspectorExitTimerRef.current);
      setInspectorExiting(false);
      return true;
    });
  }, []);
  const setPrototypeFolderChip = useCallback((value: PrototypeFolderChip | null) => {
    setPrototypeFolderChipState((prev) => (prototypeFolderChipsEqual(prev, value) ? prev : value));
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
      sidebarListMode,
      setSidebarListMode,
      sidebarFolderDrilldown,
      setSidebarFolderDrilldown,
      sidebarDictionarySlug,
      setSidebarDictionarySlug,
      ensureSidebarExpanded,
      inspectorOpen,
      inspectorExiting,
      toggleInspector,
      openInspector,
      closeInspector,
      setPrototypeFolderChip,
      standaloneScripturePassage,
      openStandaloneScripturePassage,
      dismissStandaloneScripturePassage,
      editorChromeMode,
      setEditorChromeMode,
      formatToolbarHostEl,
      setFormatToolbarHostEl,
      studyDockCarouselHostEl,
      setStudyDockCarouselHostEl,
      referenceChromeHostEl,
      setReferenceChromeHostEl,
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
      sidebarListMode,
      setSidebarListMode,
      sidebarFolderDrilldown,
      setSidebarFolderDrilldown,
      sidebarDictionarySlug,
      setSidebarDictionarySlug,
      ensureSidebarExpanded,
      inspectorOpen,
      inspectorExiting,
      toggleInspector,
      openInspector,
      closeInspector,
      setPrototypeFolderChip,
      standaloneScripturePassage,
      openStandaloneScripturePassage,
      dismissStandaloneScripturePassage,
      editorChromeMode,
      formatToolbarHostEl,
      studyDockCarouselHostEl,
      referenceChromeHostEl,
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
