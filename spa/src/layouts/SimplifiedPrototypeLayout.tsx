import PrototypePinPanels from '../pages/prototype/PrototypePinPanels';
import ReferralCreditInit from '../../../src/components/react/ReferralCreditInit';
import KeyboardShortcutsInit from '../../../src/components/react/KeyboardShortcutsInit';
import SyncManagerIsland from '../../../src/components/react/SyncManagerIsland';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { HARVOUS_REMOTE_SYNC_COMPLETED } from '@/utils/harvous-remote-sync-event';
import { refreshPrototypeLists } from '../lib/refresh-client-data';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import NativeToolbar from '../pages/prototype/NativeToolbar';
import PrototypeSidebarToolbar from '../pages/prototype/PrototypeSidebarToolbar';
import PrototypeSidebar from '../pages/prototype/PrototypeSidebar';
import PrototypeEditorChromeBar from '../pages/prototype/PrototypeEditorChromeBar';
import '../styles/prototype-tokens.css';
import '../styles/prototype-shell.css';
import '../styles/prototype-components.css';
import '../styles/prototype-editor.css';
import '../styles/prototype-route-overrides.css';
import { hasClerkSessionCookieHint } from '../hooks/queries/useProfile';
import { usePrototypeHomeSpaceId } from '../hooks/usePrototypeHomeSpaceId';
import { updateStudyDockExpandedMaxHeight } from '@/utils/study-dock-layout';
import { noteParamSlug, PROTOTYPE_DRAFT_NOTE_SLUG } from '../pages/prototype/proto-route-slugs';
import { PROTO_LAST_SPACE_KEY } from './proto-session-keys';
import { ProtoMigrationProvider } from './proto-migration-context';
import { ProtoShellProvider, useProtoShell } from './proto-shell-context';
import {
  applyBackgroundWithImageTint,
  clearBackgroundVars,
  getColorSchemeSnapshot,
  PROTO_ROUTE_CLASS,
  readBackground,
  subscribeColorScheme,
} from '../lib/prototype-background';
import {
  isPrototypeHomePath,
  isPrototypeNotePath,
  isPrototypeSearchPath,
  isPrototypeShellPath,
  prototypeHomePath,
  prototypeNoteRouteTo,
} from '@/lib/prototype-path';

export default function SimplifiedPrototypeLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRaw = useRouterState({ select: (s) => s.location.search });
  const { homeSpaceId, navReady } = usePrototypeHomeSpaceId();
  const hasSessionCookie = hasClerkSessionCookieHint();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const path = `${pathname}${typeof searchRaw === 'string' ? searchRaw : ''}`;
      sessionStorage.setItem('harvous-prototype-return', path);
    } catch {
      /* ignore */
    }
  }, [isLoaded, isSignedIn, pathname, searchRaw]);

  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light');

  useLayoutEffect(() => {
    const el = document.documentElement;
    el.classList.add(PROTO_ROUTE_CLASS);
    void applyBackgroundWithImageTint(readBackground());
    return () => {
      el.classList.remove(PROTO_ROUTE_CLASS);
      clearBackgroundVars();
    };
  }, []);

  useEffect(() => {
    void applyBackgroundWithImageTint(readBackground());
  }, [colorScheme]);

  useEffect(() => {
    if (!isLoaded || isSignedIn || hasSessionCookie) return;
    const path =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search || ''}`
        : prototypeHomePath();
    router.navigate({
      to: '/sign-in',
      search: { redirect_url: path },
      replace: true,
    });
  }, [isLoaded, isSignedIn, hasSessionCookie, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!navReady || !homeSpaceId) return;
    const onMain = isPrototypeHomePath(pathname) || isPrototypeNotePath(pathname);
    if (!onMain) return;
    try {
      localStorage.setItem(PROTO_LAST_SPACE_KEY, homeSpaceId);
    } catch {
      /* ignore */
    }
  }, [isLoaded, isSignedIn, navReady, homeSpaceId, pathname]);

  // Render the shell as soon as React mounts — don't gate on Clerk `isLoaded`.
  // Prototype is auth-gated, so returning null while Clerk loads would leave only
  // the boot-painted canvas visible until isLoaded resolves (the shell "popping in").
  const shouldShowShell =
    !isLoaded || hasSessionCookie || (isLoaded && isSignedIn);

  if (!shouldShowShell) {
    return null;
  }

  return (
    <ProtoMigrationProvider>
      <ProtoShellProvider>
        <PrototypeAuthenticatedChrome userId={user?.id} />
      </ProtoShellProvider>
    </ProtoMigrationProvider>
  );
}

function PrototypeAuthenticatedChrome({ userId }: { userId?: string }) {
  const queryClient = useQueryClient();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  useRealtimeSync(userId, { homeSpaceId });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const {
    isMobileSidebar,
    drawerOpen,
    closeDrawer,
    desktopSidebarCollapsed,
    sidebarExiting,
    sidebarWidth,
    setSidebarWidth,
    persistSidebarWidth,
    sidebarWidthMin,
    sidebarWidthMax,
    inspectorOpen,
    setHideSidebar,
  } = useProtoShell();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(sidebarWidth);

  const hideSidebar = isPrototypeSearchPath(pathname);
  const isNoteRoute = isPrototypeNotePath(pathname);
  // inspector is rendered inline in PrototypeNotePage (flex-row), no extra grid column needed
  void inspectorOpen;

  useEffect(() => {
    setHideSidebar(hideSidebar);
  }, [hideSidebar, setHideSidebar]);

  useEffect(() => {
    widthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!userId) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onRemoteSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshPrototypeLists(queryClient, homeSpaceId);
      }, 600);
    };
    window.addEventListener(HARVOUS_REMOTE_SYNC_COMPLETED, onRemoteSync);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(HARVOUS_REMOTE_SYNC_COMPLETED, onRemoteSync);
    };
  }, [userId, queryClient, homeSpaceId]);

  useEffect(() => {
    if (!userId) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isPrototypeShellPath(pathname)) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshPrototypeLists(queryClient, homeSpaceId);
      }, 400);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, pathname, queryClient, homeSpaceId]);

  // Mobile soft keyboard: shrink the shell frame to the visual viewport (above the keyboard)
  // so the in-flow editor chrome row (format toolbar) lands just above the keyboard, and hide
  // the study docks while typing. Scoped to note routes on the mobile breakpoint.
  useEffect(() => {
    if (!isNoteRoute) return undefined;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const mq = window.matchMedia('(max-width: 899px)');
    const root = document.documentElement;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const pinPageScroll = () => {
      if (window.scrollY !== 0 || vv.offsetTop !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const lockPageScroll = () => {
      if (!root.hasAttribute('data-proto-page-scroll-locked')) {
        root.setAttribute('data-proto-page-scroll-locked', '');
      }
      pinPageScroll();
    };

    const unlockPageScroll = () => {
      root.removeAttribute('data-proto-page-scroll-locked');
      window.scrollTo(0, 0);
    };

    const clearKeyboardState = () => {
      root.style.removeProperty('--proto-visible-viewport-height');
      root.removeAttribute('data-proto-keyboard-open');
      unlockPageScroll();
      document
        .querySelectorAll<HTMLElement>('.proto-shell-frame')
        .forEach((frame) => {
          frame.style.removeProperty('height');
          frame.style.removeProperty('max-height');
        });
    };

    const clear = () => {
      root.style.removeProperty('--proto-dock-expanded-max-height');
      clearKeyboardState();
    };

    const updateDockMaxHeight = () => {
      updateStudyDockExpandedMaxHeight();
    };

    // Size the shell frame to exactly the visual viewport (above the keyboard) and let the
    // editor chrome row (format toolbar) stay in normal flow at the frame's bottom edge.
    // No fixed positioning / content max-height reserve — the editor and toolbar then read
    // as one continuous surface sitting just above the keyboard.
    const apply = () => {
      updateDockMaxHeight();
      if (!mq.matches) {
        clearKeyboardState();
        return;
      }
      const innerH = window.innerHeight;
      const effectiveHeight = vv.height;
      const keyboardOpen = effectiveHeight < innerH * 0.75;
      if (keyboardOpen) {
        const visibleHeight = Math.round(effectiveHeight);
        const frameInset =
          parseFloat(getComputedStyle(root).getPropertyValue('--pds-shell-frame-inset')) || 8;
        // Anchor the frame at its normal top inset (page scroll is locked to the top, so the
        // visual viewport top aligns with the layout top) and only shrink height from the
        // bottom. Using vv.offsetTop here pushes the frame down by a stale keyboard-animation
        // value, leaving an empty gap above the toolbar header.
        // Subtract only the top inset (not bottom): the frame's bottom edge then reaches the
        // visual viewport bottom so the in-flow format bar hugs the keyboard / Safari address
        // pill instead of floating well above it.
        const frameHeight = Math.max(120, visibleHeight - frameInset);
        root.style.setProperty('--proto-visible-viewport-height', `${frameHeight}px`);
        root.setAttribute('data-proto-keyboard-open', '');
        lockPageScroll();
        document.querySelectorAll<HTMLElement>('.proto-shell-frame').forEach((frame) => {
          frame.style.height = `${frameHeight}px`;
          frame.style.maxHeight = `${frameHeight}px`;
        });
      } else {
        clearKeyboardState();
      }
    };

    apply();
    const raf = requestAnimationFrame(() => apply());
    const onViewportChange = () => {
      apply();
      if (root.hasAttribute('data-proto-keyboard-open')) {
        pinPageScroll();
      }
    };
    // visualViewport resize/scroll is the primary signal; focus just nudges a re-apply
    // (rAF now + one settle after the iOS keyboard animation) instead of a timer cascade.
    const scheduleSettle = () => {
      requestAnimationFrame(apply);
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(apply, 250);
    };
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);
    window.addEventListener('resize', updateDockMaxHeight);
    document.addEventListener('focusin', scheduleSettle);
    document.addEventListener('focusout', scheduleSettle);

    return () => {
      cancelAnimationFrame(raf);
      if (settleTimer) clearTimeout(settleTimer);
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('resize', updateDockMaxHeight);
      document.removeEventListener('focusin', scheduleSettle);
      document.removeEventListener('focusout', scheduleSettle);
      clear();
    };
  }, [isNoteRoute]);

  const clampSidebarWidth = useCallback(
    (width: number) => Math.min(sidebarWidthMax, Math.max(sidebarWidthMin, width)),
    [sidebarWidthMax, sidebarWidthMin],
  );

  const applySidebarWidthToShell = useCallback((width: number) => {
    shellRef.current?.style.setProperty('--proto-sidebar-w', `${width}px`);
    resizeHandleRef.current?.setAttribute('aria-valuenow', String(Math.round(width)));
  }, []);

  const updateWidthFromClientX = useCallback(
    (clientX: number) => {
      const shellEl = shellRef.current;
      if (!shellEl) return;
      const shellRect = shellEl.getBoundingClientRect();
      const nextWidth = clampSidebarWidth(clientX - shellRect.left);
      widthRef.current = nextWidth;
      applySidebarWidthToShell(nextWidth);
    },
    [applySidebarWidthToShell, clampSidebarWidth],
  );

  const handleSidebarResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || hideSidebar || isMobileSidebar || desktopSidebarCollapsed) return;
      event.preventDefault();
      updateWidthFromClientX(event.clientX);
      shellRef.current?.classList.add('proto-shell--sidebar-resizing');

      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const cleanup = () => {
        shellRef.current?.classList.remove('proto-shell--sidebar-resizing');
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', finishResize);
        window.removeEventListener('pointercancel', finishResize);
      };

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        updateWidthFromClientX(moveEvent.clientX);
      };

      const finishResize = (upEvent: globalThis.PointerEvent) => {
        updateWidthFromClientX(upEvent.clientX);
        setSidebarWidth(widthRef.current);
        persistSidebarWidth(widthRef.current);
        cleanup();
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', finishResize);
      window.addEventListener('pointercancel', finishResize);
    },
    [
      desktopSidebarCollapsed,
      hideSidebar,
      isMobileSidebar,
      persistSidebarWidth,
      setSidebarWidth,
      updateWidthFromClientX
    ],
  );

  const handleSidebarResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (hideSidebar || isMobileSidebar || desktopSidebarCollapsed) return;
      let nextWidth: number | null = null;
      if (event.key === 'ArrowLeft') nextWidth = sidebarWidth - 16;
      else if (event.key === 'ArrowRight') nextWidth = sidebarWidth + 16;
      else if (event.key === 'Home') nextWidth = sidebarWidthMin;
      else if (event.key === 'End') nextWidth = sidebarWidthMax;
      if (nextWidth == null) return;
      event.preventDefault();
      const clamped = clampSidebarWidth(nextWidth);
      widthRef.current = clamped;
      setSidebarWidth(clamped);
      persistSidebarWidth(clamped);
    },
    [
      clampSidebarWidth,
      desktopSidebarCollapsed,
      hideSidebar,
      isMobileSidebar,
      persistSidebarWidth,
      setSidebarWidth,
      sidebarWidth,
      sidebarWidthMax,
      sidebarWidthMin,
    ],
  );

  const shellStyle = { '--proto-sidebar-w': `${sidebarWidth}px` } as CSSProperties;

  const useSplitDesktopToolbar = !hideSidebar && !isMobileSidebar;
  const showSidebarToolbar =
    useSplitDesktopToolbar && !desktopSidebarCollapsed && !sidebarExiting;

  const shellMods = [
    'proto-shell',
    'proto-theme',
    hideSidebar ? 'proto-shell--no-sidebar' : '',
    'proto-shell--no-footer',
    isNoteRoute ? 'proto-shell--note-chrome' : '',
    isMobileSidebar && drawerOpen && !hideSidebar ? 'proto-shell--drawer-open' : '',
    !hideSidebar && !isMobileSidebar && desktopSidebarCollapsed ? 'proto-shell--sidebar-collapsed' : '',
    !hideSidebar && sidebarExiting && !isMobileSidebar ? 'proto-shell--sidebar-closing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className="proto-shell-frame simplified-prototype-root">
        <div ref={shellRef} className={shellMods} style={shellStyle}>
        {userId ? (
          <SyncManagerIsland userId={userId} hideOfflineIndicator deferSyncInit />
        ) : null}
        <PrototypeShortcutBridge />
        <KeyboardShortcutsInit />
        <PrototypePinPanels />
        <ReferralCreditInit userId={userId} />

        {useSplitDesktopToolbar ? (
          <>
            {showSidebarToolbar ? (
              <header className="proto-shell__sidebar-toolbar-cell">
                <div className="proto-shell__toolbar-stack">
                  <PrototypeSidebarToolbar />
                </div>
              </header>
            ) : null}
            <header className="proto-shell__detail-toolbar-cell">
              <div className="proto-shell__toolbar-stack">
                <NativeToolbar variant="detail" />
              </div>
            </header>
          </>
        ) : (
          <header className="proto-shell__toolbar-cell">
            <div className="proto-shell__toolbar-stack">
              <NativeToolbar variant="unified" />
            </div>
          </header>
        )}

        {!hideSidebar && isMobileSidebar && (drawerOpen || sidebarExiting) ? (
          <DrawerOverlay onClose={closeDrawer} />
        ) : null}

        {!hideSidebar ? (
          <aside
            className={[
              'proto-shell__sidebar-cell',
              'proto-shell-drawer-sidebar',
              sidebarExiting ? 'proto-shell-drawer-sidebar--exiting' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <PrototypeSidebar />
          </aside>
        ) : null}
        {!hideSidebar && !isMobileSidebar && !desktopSidebarCollapsed && !sidebarExiting ? (
          <div
            ref={resizeHandleRef}
            className="proto-shell__sidebar-resize-handle"
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuemin={sidebarWidthMin}
            aria-valuemax={sidebarWidthMax}
            aria-valuenow={Math.round(sidebarWidth)}
            tabIndex={0}
            onPointerDown={handleSidebarResizePointerDown}
            onKeyDown={handleSidebarResizeKeyDown}
          />
        ) : null}

        <main className="proto-shell__main-cell">
          <div className="proto-shell__main-inner">
            <Outlet />
          </div>
        </main>

        {isNoteRoute ? <PrototypeEditorChromeBar /> : null}
        </div>
      </div>
    </>
  );
}

function DrawerOverlay({ onClose }: { onClose: () => void }) {
  return <div className="proto-shell-drawer-overlay" role="presentation" tabIndex={-1} onClick={onClose} />;
}

function PrototypeShortcutBridge() {
  const navigate = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const {
    isMobileSidebar,
    closeDrawer,
    toggleDrawer,
    toggleDesktopSidebar,
    toggleInspector,
    ensureSidebarExpanded,
    sidebarListMode,
    setSidebarListMode,
    beginPrototypeComposeSession,
  } = useProtoShell();

  const createPrototypeNote = useCallback(() => {
    if (!homeSpaceId) return;
    if (isMobileSidebar) closeDrawer();
    beginPrototypeComposeSession();
    navigate.navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: PROTOTYPE_DRAFT_NOTE_SLUG },
    });
  }, [beginPrototypeComposeSession, closeDrawer, homeSpaceId, isMobileSidebar, navigate]);

  const togglePrototypeSidebar = useCallback(() => {
    if (isMobileSidebar) toggleDrawer();
    else toggleDesktopSidebar();
  }, [isMobileSidebar, toggleDesktopSidebar, toggleDrawer]);

  const focusPrototypeNoteList = useCallback(() => {
    ensureSidebarExpanded();
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        '.proto-note-list .proto-note-row__main, .proto-note-list .proto-note-row, .proto-sidebar-search input',
      );
      target?.focus();
    });
  }, [ensureSidebarExpanded]);

  const focusPrototypeSidebarSearch = useCallback(() => {
    ensureSidebarExpanded();
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('#proto-sidebar-search-input')?.focus();
    });
  }, [ensureSidebarExpanded]);

  const cycleListMode = useCallback(
    (step: number) => {
      const order = ['notes', 'folders', 'highlights', 'scripture', 'threads'] as const;
      const currentIndex = Math.max(0, order.indexOf(sidebarListMode));
      const nextIndex = (currentIndex + step + order.length) % order.length;
      setSidebarListMode(order[nextIndex]);
      ensureSidebarExpanded();
    },
    [ensureSidebarExpanded, setSidebarListMode, sidebarListMode],
  );

  useEffect(() => {
    const onNewNote = () => createPrototypeNote();
    const onToggleSidebar = () => togglePrototypeSidebar();
    const onToggleInspector = () => {
      if (!isPrototypeNotePath(pathname)) return;
      toggleInspector();
    };
    const onFocusList = () => focusPrototypeNoteList();
    const onFocusSidebarSearch = () => focusPrototypeSidebarSearch();
    const onCycleListMode = (event: Event) => {
      const custom = event as CustomEvent<{ step?: number }>;
      const step = custom.detail?.step === -1 ? -1 : 1;
      cycleListMode(step);
    };

    window.addEventListener('prototypeShortcutNewNote', onNewNote);
    window.addEventListener('prototypeShortcutToggleSidebar', onToggleSidebar);
    window.addEventListener('prototypeShortcutToggleInspector', onToggleInspector);
    window.addEventListener('prototypeShortcutFocusNoteList', onFocusList);
    window.addEventListener('prototypeShortcutFocusSidebarSearch', onFocusSidebarSearch);
    window.addEventListener('prototypeShortcutCycleListMode', onCycleListMode as EventListener);

    return () => {
      window.removeEventListener('prototypeShortcutNewNote', onNewNote);
      window.removeEventListener('prototypeShortcutToggleSidebar', onToggleSidebar);
      window.removeEventListener('prototypeShortcutToggleInspector', onToggleInspector);
      window.removeEventListener('prototypeShortcutFocusNoteList', onFocusList);
      window.removeEventListener('prototypeShortcutFocusSidebarSearch', onFocusSidebarSearch);
      window.removeEventListener('prototypeShortcutCycleListMode', onCycleListMode as EventListener);
    };
  }, [
    createPrototypeNote,
    cycleListMode,
    focusPrototypeNoteList,
    focusPrototypeSidebarSearch,
    pathname,
    toggleInspector,
    togglePrototypeSidebar,
  ]);

  return null;
}
