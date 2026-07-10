/**
 * Synchronous first-paint bootstrap for public routes: join, shared note/thread, invitations, add-on.
 * These paths skip prototype-route-boot.js but still need correct paper + toolbar chrome
 * before the Vite CSS bundle and lazy route chunks load.
 *
 * Keep path detection in sync with public/scripts/prototype-shell-path.js and
 * src/lib/prototype-path.ts (NON_PROTOTYPE_PREFIXES).
 */
(function publicRouteBoot() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var shellPath = window.__harvousPrototypeShellPath;
  if (!shellPath || !shellPath.isPublicAppPath) return;

  var path = window.location.pathname;
  if (!shellPath.isPublicAppPath(path)) return;

  var PUBLIC_ROUTE_CLASS = 'harvous-public-route';
  var root = document.documentElement;
  root.classList.add(PUBLIC_ROUTE_CLASS);

  if (!document.getElementById('harvous-public-route-critical')) {
    var style = document.createElement('style');
    style.id = 'harvous-public-route-critical';
    style.textContent =
      ':root{--site-paper:#f7f6f3;--site-ink:#1a1916;--site-ink-soft:#5a584f;--site-rule:#e7e4dc;--site-card:#ffffff;--site-accent:#3869e6}' +
      'html.' +
      PUBLIC_ROUTE_CLASS +
      ',html.' +
      PUBLIC_ROUTE_CLASS +
      ' body,html.' +
      PUBLIC_ROUTE_CLASS +
      ' #root{background-color:var(--site-paper) !important;color:var(--site-ink);font-family:"Google Sans Flex",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}' +
      'html.' +
      PUBLIC_ROUTE_CLASS +
      ' #root{min-height:100%;display:flex;flex-direction:column}' +
      '.public-page{font-family:inherit;background:var(--site-paper);min-height:100svh;color:var(--site-ink);display:flex;flex-direction:column;overflow:hidden}' +
      '.public-toolbar{position:sticky;top:0;display:flex;justify-content:center;padding:14px 16px;z-index:100}' +
      '.public-toolbar__pill{display:inline-flex;align-items:center;gap:8px;padding:6px 6px 6px 10px;background:rgba(255,255,255,.85);border:.5px solid var(--site-rule);border-radius:999px;box-shadow:0 1px 3px rgba(26,25,22,.06)}' +
      '.public-toolbar__cta{display:inline-flex;align-items:center;padding:8px 14px;border-radius:999px;background:var(--site-accent);color:#fff;font-size:14px;font-weight:600;text-decoration:none}' +
      '.public-body{flex:1;overflow:auto}' +
      '.page-loading{display:flex;align-items:center;justify-content:center;min-height:40vh}' +
      '.page-loading::after{content:"";width:6px;height:6px;border-radius:50%;background:var(--site-ink-soft);box-shadow:12px 0 0 var(--site-ink-soft),-12px 0 0 var(--site-ink-soft);animation:harvous-public-loading-pulse 1.2s ease-in-out infinite}' +
      '@keyframes harvous-public-loading-pulse{0%,80%,100%{opacity:.35}40%{opacity:1}}';
    document.head.appendChild(style);
  }
})();
