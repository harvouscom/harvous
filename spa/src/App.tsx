import { setPwaPromptLastDismissed } from '@/utils/pwa-prompt';
import { getBackTarget, popNavStack } from '@/utils/nav-stack';
import { extractIdFromPath } from '@/utils/url-helpers';
import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-react';
import { hasClerkSessionCookieHint } from './hooks/queries/useProfile';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { clearUserClientCaches } from '@/utils/clear-user-client-caches';
import { RouterProvider } from '@tanstack/react-router';
import React, { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo, useSyncExternalStore } from 'react';
import { buildClerkAppearance } from './lib/clerk-appearance';
import { getColorSchemeSnapshot, subscribeColorScheme } from './lib/prototype-background';
import { createPortal } from 'react-dom';
import { shouldSuppressAppToasts } from '@/utils/should-suppress-app-toasts';
import { Toaster, toast as sonnerToast } from 'sonner';
import { WebHaptics } from 'web-haptics';
import { router } from './router';
import { APIError } from './lib/api';
import SpotlightSearch from './components/SpotlightSearch';
import KeyboardShortcutsInit from '../../src/components/react/KeyboardShortcutsInit';
import {
  getMobileChipBottomInsetPx,
  HARVOUS_TOASTER_MOBILE_BOTTOM_VAR,
} from '@/utils/mobile-offline-chip-layout';
import { subscribeSheetOverlayInset } from '@/utils/sheet-overlay-inset';
import { useDesktopMainModalPortal } from '@/hooks/useDesktopMainModalPortal';
import { SyncCacheBridge } from './lib/sync-cache-bridge';
import { SharedSpacesEntitlementBridge } from './lib/SharedSpacesEntitlementBridge';
import { PostHogBridge } from './components/PostHogBridge';
import {
  clearPendingAuthRedirect,
  consumePendingAuthRedirect,
  peekPendingAuthRedirect,
  pendingAuthRedirectDecision,
} from './lib/pending-auth-redirect';
import { isPrototypeShellPath, syncPublicRouteHtmlClass } from '@/lib/prototype-path';
import {
  showPrototypeFeedbackToast,
  type PrototypeFeedbackToastVariant,
} from '@/utils/prototype-feedback-toast';
import { setSupabaseRealtimeAccessTokenGetter } from '@/lib/supabase-client';

const PWA_INSTALL_INSTRUCTIONS_EVENT = 'showPwaInstallInstructions';

declare const __APP_VERSION__: string;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,           // 1 minute
      gcTime: 5 * 60_000,          // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry on 401 (session expired) — redirect to sign-in instead
        if (error instanceof APIError && error.status === 401) return false;
        return failureCount < 2;
      },
      // Refetch stale queries when the user returns to the tab/app or regains
      // network. staleTime still gates this, so quick tab flips don't refetch —
      // but coming back after being away (or after an edit on another device)
      // pulls fresh data without a manual reload.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

// Global handler lives in QueryClient401Redirect (inside ClerkProvider) so we do not redirect
// on 401 while Clerk is still loading — avoids localhost refresh flashing /sign-in then dashboard.
let redirecting401 = false;

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY env var');
}

// Build window.toast from the same sonner instance used by <Toaster>
function stripPunctuation(msg: string) {
  return msg.replace(/[.!]/g, '');
}

/**
 * Route a toast to whichever renderer the current shell actually mounts.
 *
 * `shouldSuppressAppToasts()` hides <Toaster> on the auth/upgrade shells *and* on the
 * 2.0 prototype shell — but the prototype mounts its own renderer
 * (PrototypeFeedbackToast). Without the `proto` fallback below, every `window.toast.*`
 * call and every `CustomEvent('toast')` in 2.0 was silently dropped, so users saw
 * nothing at all when a save failed. Mirrors the same fallback in `src/utils/toast.ts`.
 *
 * upgradePrompt / pwaPrompt deliberately pass no fallback: the prototype toast's action
 * button always opens the support sheet, so their Upgrade / How-to-install actions
 * cannot be represented there.
 */
function showToast(
  show: () => void,
  proto?: { message: string; variant: PrototypeFeedbackToastVariant },
) {
  if (shouldSuppressAppToasts()) {
    if (proto?.message && typeof window !== 'undefined' && isPrototypeShellPath(window.location.pathname)) {
      showPrototypeFeedbackToast(proto.message, proto.variant);
    }
    return;
  }
  show();
}

const windowToast = {
  success: (message: string) =>
    showToast(() => sonnerToast.success(stripPunctuation(message), { icon: null }), {
      message: stripPunctuation(message),
      variant: 'success',
    }),
  allSynced: () =>
    showToast(() => sonnerToast.success('Your Harvous is synced', { icon: null }), {
      message: 'Your Harvous is synced',
      variant: 'success',
    }),
  error: (message: string) =>
    showToast(() => sonnerToast.error(stripPunctuation(message), { icon: null }), {
      message: stripPunctuation(message),
      variant: 'error',
    }),
  info: (message: string) =>
    showToast(() => sonnerToast.info(stripPunctuation(message), { icon: null }), {
      message: stripPunctuation(message),
      variant: 'info',
    }),
  warning: (message: string) =>
    showToast(() => sonnerToast.warning(stripPunctuation(message), { icon: null }), {
      message: stripPunctuation(message),
      variant: 'warning',
    }),
  show: (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    windowToast[type](message);
  },
  errorWithAction: (message: string, action: { label: string; onClick: () => void }) => {
    showToast(
      () => sonnerToast.error(stripPunctuation(message), { icon: null, duration: Infinity, action }),
      // The prototype toast can render the message but not this caller's action.
      // Showing the message alone still beats dropping the error entirely.
      { message: stripPunctuation(message), variant: 'error' },
    );
  },
  upgradePrompt: (message: string, upgradeUrl?: string) => {
    showToast(() => {
      const url = upgradeUrl || '/upgrade';
      sonnerToast.error(message, {
        icon: null,
        duration: Infinity,
        className: 'harvous-upgrade-toast',
        action: {
          label: 'Upgrade',
          onClick: () => {
            try {
              sessionStorage.setItem('harvousSkipBeforeUnload', 'upgrade');
            } catch (_) {}
            window.location.href = url;
          },
        },
        cancel: { label: 'Not now', onClick: () => {} },
      });
    });
  },
  pwaPrompt: (message: string) => {
    showToast(() => {
      sonnerToast.info(message, {
        icon: null,
        duration: Infinity,
        className: 'harvous-pwa-toast',
        action: {
          label: 'How to install',
          onClick: () => {
            window.dispatchEvent(new CustomEvent(PWA_INSTALL_INSTRUCTIONS_EVENT));
          },
        },
        cancel: {
          label: 'Not now',
          onClick: () => setPwaPromptLastDismissed(),
        },
      });
    });
  },
};

/**
 * iOS standalone PWA only: set .ios-pwa on html, sync --sheet-overlay-top (padding probe + heuristics),
 * and subscribe to viewport / sheet open so scrims stay below the status bar.
 */
function IosPwaSheetOverlayInset() {
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const isPwa =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches;
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (!isPwa || !isIos) return undefined;

    document.documentElement.classList.add('ios-pwa');
    const unsub = subscribeSheetOverlayInset();
    return () => {
      unsub();
      document.documentElement.classList.remove('ios-pwa');
    };
  }, []);
  return null;
}

/** Create WebHaptics on mount and expose on window for global haptics-handler.js and src/utils/haptics.ts */
function WebHapticsSetup() {
  useEffect(() => {
    const haptics = new WebHaptics();
    window.__webHaptics = haptics;
    window.__hapticsTriggerShadow = (ms: number) => {
      const intensity = Math.min(1, ms / 30);
      haptics.trigger([{ duration: ms, intensity }]);
    };
    return () => {
      delete (window as any).__webHaptics;
      delete (window as any).__hapticsTriggerShadow;
    };
  }, []);
  return null;
}

function ToastSetup() {
  useEffect(() => {
    // Make toast available globally (app shell)
    window.toast = windowToast;

    // Expose app version globally so GetSupportPanel can read it
    (window as any).__APP_VERSION__ = __APP_VERSION__;

    // Don't show toasts on upgrade, auth, or simplified prototype shells
    // Handle ?toast=success&message=... URL params (toast-handler.js also handles these on app:route-change)
    function handleUrlToast() {
      const params = new URLSearchParams(window.location.search);
      const toastType = params.get('toast');
      const message = params.get('message');
      if (!toastType || !message) return;
      if (shouldSuppressAppToasts()) return;

      // Clean params from URL immediately
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('toast');
      newUrl.searchParams.delete('message');
      window.history.replaceState({}, '', newUrl.toString());

      const decoded = decodeURIComponent(message);
      if (toastType in windowToast) {
        (windowToast as any)[toastType](decoded);
      } else {
        windowToast.success(decoded);
      }
    }
    handleUrlToast();

    // Handle 'toast' and 'showToast' custom events dispatched by components
    // No suppression check here: windowToast's own showToast() decides per shell,
    // and forwards to the prototype renderer rather than dropping the toast.
    function handleToastEvent(event: Event) {
      const { message, type, code, upgradeUrl } = (event as CustomEvent).detail || {};
      if (code === 'SHARED_SPACE_LIMIT_EXCEEDED') {
        windowToast.upgradePrompt(message ?? '', upgradeUrl);
        return;
      }
      if (typeof type === 'string' && type in windowToast) {
        (windowToast as any)[type](message ?? '');
      } else if (message) {
        windowToast.info(message);
      }
    }

    window.addEventListener('toast', handleToastEvent);
    window.addEventListener('showToast', handleToastEvent);
    return () => {
      window.removeEventListener('toast', handleToastEvent);
      window.removeEventListener('showToast', handleToastEvent);
    };
  }, []);

  return null;
}

/** When Clerk reports signed-out, drop session caches and RQ user data so the next login never shows the previous account. */
function AuthSignedOutCacheCleanup() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    clearUserClientCaches(queryClient);
  }, [isLoaded, isSignedIn, queryClient]);
  return null;
}

/**
 * Keep Supabase Realtime authorized with a fresh Clerk session JWT.
 * Private channels fail "after a while" when the short-lived token expires
 * and setAuth is never refreshed.
 */
function SupabaseRealtimeAuthBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setSupabaseRealtimeAccessTokenGetter(null);
      return;
    }
    setSupabaseRealtimeAccessTokenGetter(() => getToken());
    return () => setSupabaseRealtimeAccessTokenGetter(null);
  }, [isLoaded, isSignedIn, getToken]);
  return null;
}

function PublicRouteClassBridge() {
  useLayoutEffect(() => {
    const syncPath = (pathname: string) => {
      syncPublicRouteHtmlClass(pathname);
    };
    syncPath(window.location.pathname);
    const unsubscribeBeforeNavigate = router.subscribe('onBeforeNavigate', (event) => {
      syncPath(event.toLocation.pathname);
    });
    const unsubscribeResolved = router.subscribe('onResolved', (event) => {
      syncPath(event.toLocation.pathname);
    });
    return () => {
      unsubscribeBeforeNavigate();
      unsubscribeResolved();
    };
  }, []);

  return null;
}

function PendingAuthRedirectBridge() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const applyPendingRedirect = () => {
      const currentUrl = window.location.href;
      const current = new URL(currentUrl);
      const isAuthPath =
        current.pathname === '/sign-in' ||
        current.pathname.startsWith('/sign-in/') ||
        current.pathname === '/sign-up' ||
        current.pathname.startsWith('/sign-up/');
      const hasExplicitRedirect = isAuthPath && current.searchParams.has('redirect_url');
      const pendingDestination = peekPendingAuthRedirect();
      const decision = pendingAuthRedirectDecision({
        isLoaded,
        isSignedIn: Boolean(isSignedIn),
        hasExplicitRedirect,
        currentDestination: currentUrl,
        pendingDestination,
        origin: current.origin,
      });

      if (decision === 'explicit' || decision === 'at-target' || decision === 'none') {
        clearPendingAuthRedirect();
        return;
      }
      if (decision !== 'navigate') return;

      const destination = consumePendingAuthRedirect();
      if (destination) {
        void router.navigate({ to: destination as any, replace: true });
      }
    };

    applyPendingRedirect();
    return router.subscribe('onResolved', applyPendingRedirect);
  }, [isLoaded, isSignedIn]);

  return null;
}

function QueryClient401Redirect() {
  const { isLoaded, isSignedIn } = useAuth();
  const isLoadedRef = useRef(isLoaded);
  const isSignedInRef = useRef(isSignedIn);
  isLoadedRef.current = isLoaded;
  isSignedInRef.current = isSignedIn;

  useEffect(() => {
    const maybeRedirect = (error: unknown) => {
      if (!(error instanceof APIError && error.status === 401)) return;
      if (!isLoadedRef.current) return;
      // Clerk may still be restoring session from cookies; avoid bouncing to sign-in.
      if (hasClerkSessionCookieHint()) return;
      if (isSignedInRef.current) return;
      if (redirecting401) return;
      redirecting401 = true;
      window.location.href = '/sign-in';
    };

    const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.status === 'error') {
        maybeRedirect(event.query.state.error);
      }
    });
    const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.mutation?.state.status === 'error') {
        maybeRedirect(event.mutation.state.error);
      }
    });
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, []);

  return null;
}

function UserIdSync() {
  const { user } = useUser();
  useEffect(() => {
    if (user?.id) {
      (window as any).__harvous_userId = user.id;
      try {
        localStorage.setItem('harvous-user-id', user.id);
      } catch (_) {}
    }
  }, [user?.id]);
  return null;
}

function PwaInstallInstructionsModal({ onClose }: { onClose: () => void }) {
  const { portalTarget } = useDesktopMainModalPortal();
  return createPortal(
    <div
      className="pwa-install-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="pwa-install-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="pwa-install-modal-title" className="pwa-install-modal__title">
          Add Harvous to your home screen
        </h2>
        <div className="pwa-install-modal__section">
          <strong>iPhone (Safari)</strong>
          <ol>
            <li>Tap the <strong>Share</strong> icon (square with arrow)</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
            <li>Tap <strong>Add</strong></li>
          </ol>
        </div>
        <div className="pwa-install-modal__section">
          <strong>Android (Chrome)</strong>
          <ol>
            <li>Tap the menu (⋮)</li>
            <li>Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong></li>
          </ol>
        </div>
        <p className="pwa-install-modal__footer">
          Then open Harvous from your home screen for a faster, app-like experience.
        </p>
        <button
          type="button"
          className="btn btn--primary btn--sm btn-animate-squish pwa-install-modal__close"
          onClick={onClose}
        >
          <span className="btn__content">Close</span>
          <span className="btn__shadow-overlay" aria-hidden="true" />
        </button>
      </div>
    </div>,
    portalTarget
  );
}

function SpaToaster() {
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [showPwaInstructions, setShowPwaInstructions] = useState(false);

  useEffect(() => {
    const handler = () => setShowPwaInstructions(true);
    window.addEventListener(PWA_INSTALL_INSTRUCTIONS_EVENT, handler);
    return () => window.removeEventListener(PWA_INSTALL_INSTRUCTIONS_EVENT, handler);
  }, []);

  const checkViewport = useCallback(() => {
    const width = window.innerWidth;
    setIsMobile(width < 1160);
    setIsSmallScreen(width < 800);
  }, []);

  useEffect(() => {
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, [checkViewport]);

  useLayoutEffect(() => {
    if (!isMobile) {
      document.documentElement.style.removeProperty(HARVOUS_TOASTER_MOBILE_BOTTOM_VAR);
      return;
    }
    const update = () => {
      const px = getMobileChipBottomInsetPx();
      document.documentElement.style.setProperty(HARVOUS_TOASTER_MOBILE_BOTTOM_VAR, `${px}px`);
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(document.body);
    const scrollRoots = [
      ...document.querySelectorAll('.main-column__scroll'),
      ...document.querySelectorAll('.mobile-main__body'),
    ];
    const onScroll = () => update();
    scrollRoots.forEach((el) => el.addEventListener('scroll', onScroll, { passive: true }));
    window.addEventListener('resize', update);
    const raf1 = requestAnimationFrame(() => {
      update();
      requestAnimationFrame(update);
    });
    return () => {
      ro.disconnect();
      scrollRoots.forEach((el) => el.removeEventListener('scroll', onScroll));
      window.removeEventListener('resize', update);
      cancelAnimationFrame(raf1);
      document.documentElement.style.removeProperty(HARVOUS_TOASTER_MOBILE_BOTTOM_VAR);
    };
  }, [isMobile]);

  const baseStyle: React.CSSProperties = {
    backgroundColor: 'rgb(255, 255, 255)',
    background: 'linear-gradient(168.707deg, rgba(255, 255, 255, 1.0) 11.711%, rgb(248, 248, 248) 71.325%)',
    color: 'var(--color-deep-grey)',
    fontFamily: '"Reddit Sans", system-ui, -apple-system, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    borderRadius: '24px',
    boxShadow: '0px 7px 16px 0px rgba(0,0,0,0.1), 0px 30px 30px 0px rgba(0,0,0,0.09), 0px 67px 40px 0px rgba(0,0,0,0.05), 0px 119px 47px 0px rgba(0,0,0,0.01)',
    padding: '16px 20px',
    textAlign: 'center',
    minWidth: '280px',
  };

  const toastStyle: React.CSSProperties = isSmallScreen
    ? { ...baseStyle, width: '90vw', minWidth: undefined }
    : baseStyle;

  return (
    <>
      {showPwaInstructions && (
        <PwaInstallInstructionsModal onClose={() => setShowPwaInstructions(false)} />
      )}
      <Toaster
        position={isMobile ? 'bottom-center' : 'bottom-right'}
        toastOptions={{
          duration: 4000,
          style: toastStyle,
          classNames: {
            toast: 'rounded-xl toast-center-text',
            title: 'font-semibold text-[16px] text-center',
          },
        }}
      />
      <style>{`
        /* ── Upgrade toast layout: message top full-width, buttons side-by-side centered below ── */
        /* Sonner renders: [data-content] then button[data-cancel] then button[data-action] as direct children */
        [data-sonner-toast].harvous-upgrade-toast,
        [data-sonner-toast].harvous-pwa-toast,
        [data-sonner-toast]:has(button[data-cancel]) {
          display: flex !important;
          flex-wrap: wrap !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 0.5rem !important;
          padding-bottom: 16px !important;
        }

        /* Message: full width on its own row */
        [data-sonner-toast].harvous-upgrade-toast > [data-content],
        [data-sonner-toast].harvous-pwa-toast > [data-content],
        [data-sonner-toast]:has(button[data-cancel]) > [data-content] {
          flex: 0 0 100% !important;
          width: 100% !important;
          text-align: center !important;
        }

        /* Both buttons: equal width, share the row */
        [data-sonner-toast].harvous-upgrade-toast > button,
        [data-sonner-toast].harvous-pwa-toast > button,
        [data-sonner-toast]:has(button[data-cancel]) > button[data-cancel],
        [data-sonner-toast]:has(button[data-cancel]) > button[data-action] {
          flex: 1 1 auto !important;
        }

        /* ── Shared button base (btn--sm) ── */
        [data-sonner-toast] button[data-action],
        [data-sonner-toast] button[data-cancel],
        [data-sonner-toast] button[data-button] {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: none !important;
          border-radius: 1rem !important;
          padding: 0.75rem 1.25rem 1rem !important;
          font-family: var(--font-sans) !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          line-height: 0 !important;
          min-height: 40px !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: transform 0.15s, box-shadow 0.15s !important;
          margin: 0 !important;
          flex: 1 !important;
          max-width: 160px !important;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25) !important;
        }

        /* ── Primary (Upgrade / single action): btn--sm btn--primary ── */
        [data-sonner-toast] button[data-action],
        [data-sonner-toast] button[data-button]:not([data-cancel]) {
          background-color: var(--color-bold-blue) !important;
          color: white !important;
        }
        [data-sonner-toast] button[data-action] *,
        [data-sonner-toast] button[data-button]:not([data-cancel]) * {
          color: white !important;
        }
        [data-sonner-toast] button[data-action]:hover,
        [data-sonner-toast] button[data-button]:not([data-cancel]):hover {
          background-color: var(--color-bold-blue) !important;
        }
        [data-sonner-toast] button[data-action]:active,
        [data-sonner-toast] button[data-button]:not([data-cancel]):active {
          background-color: var(--color-navy) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }

        /* ── Secondary (Not now): btn--sm btn--secondary ── */
        [data-sonner-toast] button[data-cancel] {
          background-color: var(--color-stone-grey) !important;
          color: white !important;
        }
        [data-sonner-toast] button[data-cancel] * {
          color: white !important;
        }
        [data-sonner-toast] button[data-cancel]:hover {
          background-color: var(--color-stone-grey) !important;
        }
        [data-sonner-toast] button[data-cancel]:active {
          background-color: var(--color-deep-grey) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset !important;
        }

        /* ── PWA install instructions modal ── */
        .pwa-install-modal-overlay {
          position: fixed;
          inset: 0;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000025;
          padding: 16px;
        }
        .pwa-install-modal {
          background: var(--color-light-paper, #fff);
          border-radius: 24px;
          box-shadow: var(--dialog-elevation-shadow);
          max-width: 400px;
          width: 100%;
          padding: 24px;
          font-family: var(--font-sans);
          color: var(--color-deep-grey);
        }
        .pwa-install-modal__title {
          margin: 0 0 16px;
          font-size: 18px;
          font-weight: 600;
          text-align: center;
        }
        .pwa-install-modal__section {
          margin-bottom: 16px;
        }
        .pwa-install-modal__section strong {
          display: block;
          margin-bottom: 4px;
          font-size: 14px;
        }
        .pwa-install-modal__section ol {
          margin: 0;
          padding-left: 1.25rem;
          list-style-type: decimal;
          font-size: 14px;
          line-height: 1.5;
          font-weight: 400;
        }
        .pwa-install-modal__section ol li {
          margin-bottom: 4px;
        }
        .pwa-install-modal__footer {
          margin: 0 0 20px;
          font-size: 13px;
          line-height: 1.4;
          opacity: 0.9;
        }
        .pwa-install-modal__close {
          display: block;
          width: 100%;
          margin-top: 4px;
        }
      `}</style>
    </>
  );
}

/** In dev, poll /api/health and show a banner when the API is unreachable (e.g. only SPA running). */
function DevApiHealthBanner() {
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const check = async () => {
      try {
        const res = await fetch('/api/health', { credentials: 'omit', cache: 'no-store' });
        setUnreachable(!res.ok);
      } catch {
        setUnreachable(true);
      }
    };

    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!import.meta.env.DEV || !unreachable) return null;

  return createPortal(
    <div
      className="dev-api-health-banner"
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000000,
        background: 'var(--color-navy, #1a1a2e)',
        color: '#fff',
        padding: '8px 16px',
        fontSize: '14px',
        fontWeight: 600,
        textAlign: 'center',
        fontFamily: 'var(--font-sans)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      API unreachable — run <code style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>npm run dev:all</code> to start both the API and SPA.
    </div>,
    document.body
  );
}

/** Intercept in-app <a> clicks so navigation is client-side (instant) instead of full page load. */
function useInAppLinkInterceptor() {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor || !anchor.href) return;

      // Clerk prebuilt sign-in/up manages its own step navigation (path or hash).
      if (
        anchor.closest('.cl-rootBox, .clerk-form-root, [class*="cl-signIn-"], [class*="cl-signUp-"]')
      ) {
        return;
      }

      try {
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return;
        if (anchor.target === '_blank' || anchor.rel?.includes('external')) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;

        const onAuthPage =
          window.location.pathname === '/sign-in' || window.location.pathname.startsWith('/sign-in/') ||
          window.location.pathname === '/sign-up' || window.location.pathname.startsWith('/sign-up/');
        if (onAuthPage && url.pathname === window.location.pathname && url.hash && url.hash !== window.location.hash) {
          return;
        }

        let path = url.pathname + url.search + url.hash;
        if (path === window.location.pathname + window.location.search + (window.location.hash || '')) return;

        // Breadcrumb back: when on a note page and clicking a thread link,
        // navigate to the parent note (one level up) instead of the thread.
        if (url.pathname.match(/^\/thread\//) && window.location.pathname.startsWith('/note/')) {
          const currentNoteId = extractIdFromPath(window.location.pathname);
          const threadId = extractIdFromPath(url.pathname);
          if (currentNoteId?.startsWith('note_') && threadId?.startsWith('thread_')) {
            const backTarget = getBackTarget(currentNoteId, threadId);
            if (backTarget.startsWith('/note/')) {
              popNavStack(threadId);
              path = backTarget;
            }
          }
        }

        e.preventDefault();
        router.navigate({ to: path as any });
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);
}

function HarvousClerkProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light');
  const appearance = useMemo(() => buildClerkAppearance(colorScheme === 'dark'), [colorScheme]);

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} appearance={appearance}>
      {children}
    </ClerkProvider>
  );
}

export default function App() {
  useInAppLinkInterceptor();

  return (
    <HarvousClerkProvider>
      <QueryClientProvider client={queryClient}>
        <AuthSignedOutCacheCleanup />
        <SupabaseRealtimeAuthBridge />
        <PublicRouteClassBridge />
        <PendingAuthRedirectBridge />
        <QueryClient401Redirect />
        <PostHogBridge />
        <IosPwaSheetOverlayInset />
        <WebHapticsSetup />
        <DevApiHealthBanner />
        <ToastSetup />
        <UserIdSync />
        <SyncCacheBridge />
        <SharedSpacesEntitlementBridge />
        <SpaToaster />
        <KeyboardShortcutsInit />
        <SpotlightSearch />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </HarvousClerkProvider>
  );
}
