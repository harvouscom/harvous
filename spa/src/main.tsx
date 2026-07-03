import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initDiagnosticCapture } from '@/utils/diagnostics-client';
import { showPrototypeAppUpdateNotice } from '@/utils/prototype-app-update-notice';
import {
  REDUCE_MOTION_APP_PREFERENCE_ENABLED,
  REDUCE_MOTION_STORAGE_KEY,
  syncReduceMotionFromStorage,
} from '@/utils/reduce-motion';

// ── Vite chunk load error recovery ──────────────────────────────────────────
// After a new deployment, old hashed JS chunk URLs no longer exist on the CDN.
// Vite fires a "vite:preloadError" event when a dynamic import fails (404).
// Without this handler the SPA goes blank. We reload once to pick up the
// fresh index.html + new chunk URLs. A sessionStorage flag prevents
// infinite reload loops in case the reload itself still fails.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'vite_preload_reload_attempted';
  // Report chunk load failure for correlation with Netlify 404s and deploys
  try {
    if (typeof (window as any).posthog?.capture === 'function') {
      (window as any).posthog.capture('chunk_load_failed', {
        reload_attempted: !!sessionStorage.getItem(KEY),
      });
    }
  } catch (_) {}

  if (!sessionStorage.getItem(KEY)) {
    sessionStorage.setItem(KEY, '1');
    window.location.reload();
  } else {
    // Second failure — show recovery UI rather than staying blank
    sessionStorage.removeItem(KEY);
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
            <button onclick="sessionStorage.clear();window.location.reload()" style="background:#4a473d;color:#fff;border:none;padding:14px 28px;border-radius:12px;font-size:16px;cursor:pointer;font-family:inherit">Reload App</button>
          </div>
        </div>`;
    }
  }
});

// Preload critical webfonts before @font-face rules (reduces swap → system font on fast route changes)
import './font-preload';

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
/* Study dock accent fills (native parity) — before prototype-tokens aliases. */
import '../../src/styles/study-highlight-accent-colors.css';
import '../../src/styles/scripture-pill-accent.css';
/* Prototype design tokens on :root — needed before lazy layout paints portaled UI. */
import './styles/prototype-tokens.css';

syncReduceMotionFromStorage();
initDiagnosticCapture();
if (REDUCE_MOTION_APP_PREFERENCE_ENABLED) {
  window.addEventListener('storage', (e) => {
    if (e.key === REDUCE_MOTION_STORAGE_KEY) {
      syncReduceMotionFromStorage();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
