import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Breakpoint sync with prototype-shell.css (899px drawer). */
const MOBILE_MQ = '(max-width: 899px)';

export type SidebarListMode = 'notes' | 'folders' | 'highlights' | 'scripture' | 'dictionary';

/** `undefined` = top-level list; `null` = “No folder” drill-down; `string` = named folder. */
export type SidebarFolderDrilldown = string | null | undefined;

/** Toolbar folder chip on prototype note routes — driven by note page + editor collection state. */
export type PrototypeFolderChip = { noteId: string; label: string | null };

/** Scripture-passage highlight opened from Highlights list — main pane shows standalone passage (native dock parity). */
export type StandaloneScripturePassageState = {
  canonicalReference: string;
  translationCode: string;
  focusedHighlightThreadId: string;
};

type ProtoShellContextValue = {
  /** Desktop: pinned open. Mobile drawer: overlay open flag. */
  drawerOpen: boolean;
  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  isMobileSidebar: boolean;
  /** Desktop only: hides the pinned sidebar column (toolbar toggle ⌘\ equivalent). */
  desktopSidebarCollapsed: boolean;
  toggleDesktopSidebar: () => void;
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
  toggleInspector: () => void;
  openInspector: () => void;
  closeInspector: () => void;
  prototypeFolderChip: PrototypeFolderChip | null;
  setPrototypeFolderChip: (value: PrototypeFolderChip | null) => void;
  standaloneScripturePassage: StandaloneScripturePassageState | null;
  openStandaloneScripturePassage: (value: StandaloneScripturePassageState) => void;
  dismissStandaloneScripturePassage: () => void;
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [sidebarListMode, setSidebarListModeState] = useState<SidebarListMode>('notes');
  const [sidebarFolderDrilldown, setSidebarFolderDrilldown] = useState<SidebarFolderDrilldown>(undefined);
  const [sidebarDictionarySlug, setSidebarDictionarySlug] = useState<string | undefined>(undefined);
  const [prototypeFolderChip, setPrototypeFolderChipState] = useState<PrototypeFolderChip | null>(null);
  const [standaloneScripturePassage, setStandaloneScripturePassage] = useState<StandaloneScripturePassageState | null>(
    null,
  );

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

  const toggleDrawer = useCallback(() => setDrawerOpen((x) => !x), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDesktopSidebar = useCallback(() => setDesktopSidebarCollapsed((x) => !x), []);
  const setSidebarListMode = useCallback((mode: SidebarListMode) => {
    setSidebarListModeState(mode);
    if (mode !== 'folders') setSidebarFolderDrilldown(undefined);
    if (mode !== 'dictionary') setSidebarDictionarySlug(undefined);
  }, []);
  const ensureSidebarExpanded = useCallback(() => {
    if (isMobileSidebar) openDrawer();
    else setDesktopSidebarCollapsed(false);
  }, [isMobileSidebar, openDrawer]);
  const toggleInspector = useCallback(() => setInspectorOpen((x) => !x), []);
  const openInspector = useCallback(() => setInspectorOpen(true), []);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);
  const setPrototypeFolderChip = useCallback((value: PrototypeFolderChip | null) => {
    setPrototypeFolderChipState(value);
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
      toggleDesktopSidebar,
      sidebarListMode,
      setSidebarListMode,
      sidebarFolderDrilldown,
      setSidebarFolderDrilldown,
      sidebarDictionarySlug,
      setSidebarDictionarySlug,
      ensureSidebarExpanded,
      inspectorOpen,
      toggleInspector,
      openInspector,
      closeInspector,
      prototypeFolderChip,
      setPrototypeFolderChip,
      standaloneScripturePassage,
      openStandaloneScripturePassage,
      dismissStandaloneScripturePassage,
    }),
    [
      drawerOpen,
      toggleDrawer,
      openDrawer,
      closeDrawer,
      isMobileSidebar,
      desktopSidebarCollapsed,
      toggleDesktopSidebar,
      sidebarListMode,
      setSidebarListMode,
      sidebarFolderDrilldown,
      setSidebarFolderDrilldown,
      sidebarDictionarySlug,
      setSidebarDictionarySlug,
      ensureSidebarExpanded,
      inspectorOpen,
      toggleInspector,
      openInspector,
      closeInspector,
      prototypeFolderChip,
      setPrototypeFolderChip,
      standaloneScripturePassage,
      openStandaloneScripturePassage,
      dismissStandaloneScripturePassage,
    ],
  );

  return <ProtoShellContext.Provider value={value}>{children}</ProtoShellContext.Provider>;
}

export function useProtoShell() {
  const ctx = useContext(ProtoShellContext);
  if (!ctx) throw new Error('useProtoShell requires ProtoShellProvider');
  return ctx;
}
