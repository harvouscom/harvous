/*
 * First, before anything else is imported: the prototype's component stylesheet.
 *
 * Load order decides equal-specificity ties, and almost every other stylesheet in the app is
 * written to override this one — prototype-shell's `.proto-note-row__main--lead { display: grid }`
 * over `.proto-note-row__main { display: block }`, the panel's folder rows over the sidebar's
 * tiles, tokens' `.pds-list-*` roles, the dock and pill sheets the router pulls in. That held by
 * accident: PrototypeSyncChip was imported early and dragged this file in with it. #270 removed
 * that chip, this file fell to the end of the cascade, and its defaults beat the rules written to
 * replace them — the Library panel's rows lost their grid. Importing it here first makes the order
 * a decision rather than a side effect of what some component imports.
 */
import './styles/prototype-components.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { queryClient } from './lib/query-client';
import { restorePersistedQueryCache } from '@/utils/query-cache-persistence';
import {
  initDiagnosticCapture,
  markChunkReloadExhausted,
  markChunkReloadInFlight,
} from '@/utils/diagnostics-client';
import { isGuestModeActive, startGuestSessionFromUrl } from './lib/guest-session';
import { clearAppCachesThen, showPrototypeAppUpdateNotice } from '@/utils/prototype-app-update-notice';
import { enforceProductionClerkKey } from '@/utils/production-clerk-key-guard';
import {
  REDUCE_MOTION_APP_PREFERENCE_ENABLED,
  REDUCE_MOTION_STORAGE_KEY,
  syncReduceMotionFromStorage,
} from '@/utils/reduce-motion';

// ── Vite chunk load error recovery ──────────────────────────────────────────
// After a new deployment, old hashed JS chunk URLs no longer exist on the CDN.
// Vite fires a "vite:preloadError" event when a dynamic import fails (404).
// Without this handler the SPA goes blank. We reload once to pick up the
// fresh index.html + new chunk URLs. A sessionStorage timestamp prevents
// infinite reload loops in case the reload itself still fails.
//
// The timestamp expires: a tab that recovered from one deploy must be able to recover from
// the next one hours later the same way, rather than going straight to the notice. Only a
// failure within a minute of the last reload counts as the reload not having worked.
const CHUNK_RELOAD_KEY = 'vite_preload_reload_attempted';
const CHUNK_RELOAD_WINDOW_MS = 60_000;

function chunkReloadRecentlyAttempted(): boolean {
  const at = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY));
  return Number.isFinite(at) && at > 0 && Date.now() - at < CHUNK_RELOAD_WINDOW_MS;
}

/*
 * Only the first failure on a page decides anything. A resumed tab often fails several chunks
 * at once (the Oct 11 report: a callout's CSS and push-reminders in the same second); the rest
 * are the same failure, not the reload having failed. Without this, the second failure on a
 * page that had already given up re-entered the reload branch, and two missing chunks
 * reloaded forever.
 */
let chunkFailureHandled = false;

window.addEventListener('vite:preloadError', () => {
  if (chunkFailureHandled) return;
  chunkFailureHandled = true;
  const recentlyAttempted = chunkReloadRecentlyAttempted();
  // Report chunk load failure for correlation with Netlify 404s and deploys
  try {
    if (typeof (window as any).posthog?.capture === 'function') {
      (window as any).posthog.capture('chunk_load_failed', {
        reload_attempted: recentlyAttempted,
      });
    }
  } catch (_) {}

  if (!recentlyAttempted) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    // Before the rethrow reaches the diagnostics listeners: this failure is being recovered.
    markChunkReloadInFlight();
    // Clear Cache Storage first — the SW serves `/` stale-while-revalidate, so a bare
    // reload just gets the same stale index.html and fails again.
    clearAppCachesThen(() => window.location.reload());
  } else {
    // Second failure — show recovery UI rather than staying blank. The key stays: it expires
    // by itself, and the notice's Reload clears it (reloadPrototypeAfterUpdate).
    markChunkReloadExhausted();
    const isPrototypeRoute = document.documentElement.classList.contains('harvous-prototype-route');
    if (isPrototypeRoute) {
      if (typeof window.__harvousShowAppUpdateNotice === 'function') {
        window.__harvousShowAppUpdateNotice({ needsReload: true });
      } else {
        showPrototypeAppUpdateNotice('reload');
      }
      return;
    }
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F7F7F6;padding:16px">
          <div style="text-align:center;padding:32px;max-width:400px;background:#fff;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
            <p style="color:#4a473d;font-size:17px;margin:0 0 20px">Harvous was updated. Please reload to continue.</p>
            <button onclick="sessionStorage.clear();window.location.reload()" style="background:#4a473d;color:#fff !important;-webkit-text-fill-color:#fff;border:none;padding:14px 28px;border-radius:12px;font-size:16px;cursor:pointer">Reload App</button>
          </div>
        </div>`;
    }
  }
});

// Preload critical webfonts before @font-face rules (reduces swap → system font on fast route changes)
import './font-preload';
import { initNotificationNavigation } from './lib/notification-navigation';

// Fonts — import directly from installed npm packages so they bundle correctly
import '@fontsource/reddit-sans/400.css';
import '@fontsource/reddit-sans/500.css';
import '@fontsource/reddit-sans/600.css';
import '@fontsource/reddit-sans/700.css';
import '@fontsource/reddit-mono/500.css';
import '@fontsource/reddit-mono/600.css';
import '@fontsource/literata/400.css';

// Global styles — global.css already @imports: colors, spacing, typography, buttons,
// navigation, cards, forms, panels, animations, layout, utilities.
// Only import separately what global.css does NOT include.
import '../../node_modules/vaul/style.css';
import '../../src/styles/global.css';
/* After global.css so Clerk Manage account modal beats late `button` typography rules. */
import '../../src/styles/clerk-user-profile.css';
import '../../src/styles/delete-confirm-bar.css';
import '../../src/styles/mark-spotlight.css';
import '../../src/styles/tiptap-editor.css';
import '../../src/styles/card-full-editable.css';
import '../../src/styles/auth-gradient.css';
import '../../src/styles/shared-page.css';
// `/site/`-inspired redesign for auth + shared pages. Imported AFTER
// `auth-gradient.css` so its `.auth-page__*` overrides win the cascade.
import '../../src/styles/auth-page-site.css';
import '../../src/styles/dev-badge.css';
import './styles/public-pages.css';
import '../../src/styles/upgrade-page.css';
import '../../src/styles/join-space-page.css';
/* Study dock accent fills (native parity) — before prototype-tokens aliases. */
import '../../src/styles/study-highlight-accent-colors.css';
import '../../src/styles/scripture-pill-accent.css';
import '../../src/styles/mention-pill.css';
import '../../src/styles/html5-drag-preview.css';
/* Prototype design tokens on :root — needed before lazy layout paints portaled UI. */
import './styles/prototype-tokens.css';
/* Shell + sidebar chrome (shared-space dashboard, lists) — load with entry bundle to avoid first-paint FOUC. */
import './styles/prototype-shell.css';

// A `?try=1` arrival is a guest visit. `prototype-route-boot.js` already wrote the marker on a
// real page load; this covers the cases it cannot see — dev, and any navigation that reaches
// the shell without a document load. Idempotent, so running twice costs nothing.
startGuestSessionFromUrl(window.location.search);
syncReduceMotionFromStorage();
initDiagnosticCapture();
if (REDUCE_MOTION_APP_PREFERENCE_ENABLED) {
  window.addEventListener('storage', (e) => {
    if (e.key === REDUCE_MOTION_STORAGE_KEY) {
      syncReduceMotionFromStorage();
    }
  });
}

/*
 * Before render, not inside a component.
 *
 * A notification tap focuses the app and the service worker posts the destination straight
 * away. Anything that waits for a component to mount — or worse, for a lazy chunk to load,
 * which is where this started — is not listening yet when that message arrives, and a
 * message has no queue. Registering here also picks up the destination parked for a cold
 * launch, which is the case that matters most: the tap that opened the app.
 */
initNotificationNavigation();

// Never boot a development-Clerk bundle on a production host. Returns true when it has
// started a reload or shown the recovery screen, in which case nothing else may mount:
// rendering <App /> would sign the user into the wrong Clerk instance.
//
// First render waits (at most 250ms, and in practice not at all — `index.html` started the read
// while this bundle downloaded) for last visit's query cache, so Home and the shell paint what
// was there last time and revalidate underneath instead of opening on loading dots.
if (!enforceProductionClerkKey()) {
  restorePersistedQueryCache(queryClient, { guest: isGuestModeActive() })
    .catch(() => false)
    .then(() => {
      ReactDOM.createRoot(document.getElementById('root')!).render(
        <App />
      );
    });
}
