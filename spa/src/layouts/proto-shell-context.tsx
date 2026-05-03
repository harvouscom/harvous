import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Breakpoint sync with prototype-shell.css (899px drawer). */
const MOBILE_MQ = '(max-width: 899px)';

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
  /** Inspector pane — desktop only; collapsed on mobile. */
  inspectorOpen: boolean;
  toggleInspector: () => void;
  openInspector: () => void;
  closeInspector: () => void;
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => {
      const mobile = mq.matches;
      setIsMobileSidebar(mobile);
      setDrawerOpen(!mobile ? true : false);
      if (!mobile) setDesktopSidebarCollapsed(false);
      if (mobile) setInspectorOpen(false);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const toggleDrawer = useCallback(() => setDrawerOpen((x) => !x), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDesktopSidebar = useCallback(() => setDesktopSidebarCollapsed((x) => !x), []);
  const toggleInspector = useCallback(() => setInspectorOpen((x) => !x), []);
  const openInspector = useCallback(() => setInspectorOpen(true), []);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);

  const value = useMemo(
    () => ({
      drawerOpen,
      toggleDrawer,
      openDrawer,
      closeDrawer,
      isMobileSidebar,
      desktopSidebarCollapsed,
      toggleDesktopSidebar,
      inspectorOpen,
      toggleInspector,
      openInspector,
      closeInspector,
    }),
    [
      drawerOpen,
      toggleDrawer,
      openDrawer,
      closeDrawer,
      isMobileSidebar,
      desktopSidebarCollapsed,
      toggleDesktopSidebar,
      inspectorOpen,
      toggleInspector,
      openInspector,
      closeInspector,
    ],
  );

  return <ProtoShellContext.Provider value={value}>{children}</ProtoShellContext.Provider>;
}

export function useProtoShell() {
  const ctx = useContext(ProtoShellContext);
  if (!ctx) throw new Error('useProtoShell requires ProtoShellProvider');
  return ctx;
}
