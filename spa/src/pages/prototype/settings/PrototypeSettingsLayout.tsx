import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { prototypeSettingsAccountRouteTo, prototypeSettingsRouteTo } from '@/lib/prototype-path';
import { readSettingsOpenerPath } from '../../../lib/prototype-settings-opener';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { prefetchSettingsCategoryChunks } from './prefetch-settings-chunks';
import { SETTINGS_CATEGORIES } from './settingsCategories';

function isSettingsIndexPath(pathname: string) {
  const settingsRoot = prototypeSettingsRouteTo();
  return pathname === settingsRoot || pathname === `${settingsRoot}/`;
}

/** Shown in the settings Outlet when a child path doesn't match (avoids bare "Not Found"). */
export function PrototypeSettingsNotFound() {
  return <Navigate to={prototypeSettingsAccountRouteTo()} replace />;
}

/**
 * Settings overlay — centered two-pane modal on wide screens, Vaul bottom sheet
 * on narrow. Routes under /prototype/settings/* mount this layout; the overlay
 * portals over the live shell while URLs remain the open/close trigger.
 */
export default function PrototypeSettingsLayout() {
  const { isMobileSidebar } = useProtoShell();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const closeSettings = useCallback(() => {
    const to = readSettingsOpenerPath();
    navigate({ to: to as '/', replace: true });
  }, [navigate]);

  const goToSettingsList = useCallback(() => {
    navigate({ to: prototypeSettingsRouteTo(), replace: true });
  }, [navigate]);

  useEffect(() => {
    prefetchSettingsCategoryChunks();
  }, []);

  useEffect(() => {
    if (isMobileSidebar) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobileSidebar, closeSettings]);

  const activeCategory = SETTINGS_CATEGORIES.find((cat) => pathname === cat.route);
  const isSettingsSubpage = !isSettingsIndexPath(pathname);
  const sheetTitle = isSettingsSubpage ? (activeCategory?.title ?? 'Settings') : 'Settings';

  const categoryNav = (
    <nav className="proto-settings__nav" aria-label="Settings categories">
      <div className="proto-settings__nav-list">
        {SETTINGS_CATEGORIES.map((cat) => {
          const active = pathname === cat.route;
          return (
            <button
              key={cat.key}
              type="button"
              className="proto-settings__nav-item"
              data-active={active ? 'true' : 'false'}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate({ to: cat.route as '/settings/account', replace: true })}
            >
              <span className="proto-settings__nav-icon" aria-hidden>
                <Icon name={cat.icon} size={15} />
              </span>
              <span className="proto-settings__nav-title">{cat.title}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );

  if (!isMobileSidebar) {
    if (typeof document === 'undefined') return null;

    return createPortal(
      <div className="proto-settings-modal-overlay proto-settings-modal-overlay--motion" role="presentation" onClick={closeSettings}>
        <div
          className="proto-settings-modal proto-settings-modal--motion"
          role="dialog"
          aria-label="Settings"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="proto-settings-modal__header">
            <h2 className="proto-settings-modal__title">Settings</h2>
            <button
              type="button"
              className="proto-toolbar-icon-btn proto-settings-modal__close"
              aria-label="Close settings"
              onClick={closeSettings}
            >
              <Icon name="xmark" size={18} />
            </button>
          </header>
          <div className="proto-settings-modal__body">
            <div className="proto-settings">
              {categoryNav}
              <div className="proto-settings__detail">
                <Outlet />
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <Drawer.Root
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeSettings();
      }}
    >
      <DrawerContent
        onOverlayClick={closeSettings}
        overlayClassName="proto-settings-sheet-overlay"
        className="proto-settings-sheet"
      >
        <header className="proto-settings-sheet__header">
          <div className="proto-settings-sheet__header-left">
            {isSettingsSubpage ? (
              <button
                type="button"
                className="proto-toolbar-icon-btn"
                aria-label="Back to settings list"
                onClick={goToSettingsList}
              >
                <Icon name="caret-left" size={20} />
              </button>
            ) : null}
          </div>
          <h2 className="proto-settings-sheet__title">{sheetTitle}</h2>
          <button
            type="button"
            className="proto-toolbar-icon-btn proto-settings-sheet__close"
            aria-label="Close settings"
            onClick={closeSettings}
          >
            <Icon name="xmark" size={18} />
          </button>
        </header>
        <div className="proto-settings-sheet__body">
          <Outlet />
        </div>
      </DrawerContent>
    </Drawer.Root>
  );
}
