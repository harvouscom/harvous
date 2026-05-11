import ReferralCreditInit from '../../../src/components/react/ReferralCreditInit';
import SyncManagerIsland from '../../../src/components/react/SyncManagerIsland';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import NativeToolbar from '../pages/prototype/NativeToolbar';
import PrototypeSidebar from '../pages/prototype/PrototypeSidebar';
import '../styles/prototype-tokens.css';
import '../styles/prototype-shell.css';
import '../styles/prototype-components.css';
import '../styles/prototype-editor.css';
import { PROTO_LAST_SPACE_KEY } from './proto-session-keys';
import { ProtoShellProvider, useProtoShell } from './proto-shell-context';

export default function SimplifiedPrototypeLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRaw = useRouterState({ select: (s) => s.location.search });

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const path = `${pathname}${typeof searchRaw === 'string' ? searchRaw : ''}`;
      sessionStorage.setItem('harvous-prototype-return', path);
    } catch {
      /* ignore */
    }
  }, [isLoaded, isSignedIn, pathname, searchRaw]);

  useEffect(() => {
    const el = document.documentElement;
    const cls = 'harvous-prototype-route';
    el.classList.add(cls);
    return () => {
      el.classList.remove(cls);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    const path = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search || ''}` : '/prototype';
    router.navigate({
      to: '/sign-in',
      search: { redirect_url: path },
      replace: true,
    });
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const m = pathname.match(/^\/prototype\/space\/([^/]+)/);
    if (!m) return;
    const raw = m[1];
    const id = raw.startsWith('space_') ? raw : `space_${raw}`;
    try {
      localStorage.setItem(PROTO_LAST_SPACE_KEY, id);
    } catch {
      /* ignore */
    }
  }, [isLoaded, isSignedIn, pathname]);

  if (!isLoaded) {
    return (
      <div className="proto-theme simplified-prototype-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="proto-caption">Loading…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  return (
    <ProtoShellProvider>
      <PrototypeAuthenticatedChrome userId={user?.id} />
    </ProtoShellProvider>
  );
}

function PrototypeAuthenticatedChrome({ userId }: { userId?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isMobileSidebar, drawerOpen, closeDrawer, desktopSidebarCollapsed, inspectorOpen } = useProtoShell();

  const hideSidebar = pathname === '/prototype/search' || pathname.startsWith('/prototype/search');
  // inspector is rendered inline in PrototypeNotePage (flex-row), no extra grid column needed
  void inspectorOpen;

  const shellMods = [
    'proto-shell',
    'proto-theme',
    'simplified-prototype-root',
    hideSidebar ? 'proto-shell--no-sidebar' : '',
    'proto-shell--no-footer',
    isMobileSidebar && drawerOpen && !hideSidebar ? 'proto-shell--drawer-open' : '',
    !hideSidebar && desktopSidebarCollapsed ? 'proto-shell--sidebar-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellMods}>
      {userId ? <SyncManagerIsland userId={userId} /> : null}
      <ReferralCreditInit userId={userId} />

      <header className="proto-shell__toolbar-cell">
        <NativeToolbar />
      </header>

      {!hideSidebar && isMobileSidebar && drawerOpen ? (
        <DrawerOverlay onClose={closeDrawer} />
      ) : null}

      {!hideSidebar ? (
        <aside className="proto-shell__sidebar-cell proto-shell-drawer-sidebar">
          <PrototypeSidebar />
        </aside>
      ) : null}

      <main className="proto-shell__main-cell">
        <Outlet />
      </main>
    </div>
  );
}

function DrawerOverlay({ onClose }: { onClose: () => void }) {
  return <div className="proto-shell-drawer-overlay" role="presentation" tabIndex={-1} onClick={onClose} />;
}
