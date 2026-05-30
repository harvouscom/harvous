/**
 * Synchronous first-paint bootstrap for `/prototype/*`.
 *
 * Paints both the canvas background AND the empty shell card before the Vite
 * bundle loads, so they appear together (no background-then-shell pop-in).
 *
 * The card is drawn as a `#root::before` pseudo-element — NOT a real DOM tree —
 * so React never has to replace it (which would cause layout shift). React
 * renders the real `.proto-shell-frame` on top at the exact same geometry; the
 * pseudo sits behind (z-index:-1) and is fully covered, then content fills in.
 *
 * Frame geometry mirrors `.proto-shell-frame` in prototype-shell.css.
 * Keep active key/parsing in sync with spa/src/lib/prototype-background.ts
 * (saved-image archive key is settings-only — not read here).
 */
(function prototypeRouteBoot() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var path = window.location.pathname;
  var host = window.location.hostname;
  var onDedicated = host === 'new.harvous.com';
  if (onDedicated) {
    if (path.indexOf('/sign-in') === 0 || path.indexOf('/sign-up') === 0) return;
    if (
      path !== '/' &&
      !path.startsWith('/prototype') &&
      !path.startsWith('/n/') &&
      !path.startsWith('/search') &&
      !path.startsWith('/settings') &&
      !path.startsWith('/space/')
    ) {
      return;
    }
  } else if (!path.startsWith('/prototype')) {
    return;
  }

  var PROTO_BG_KEY = 'harvous-proto-bg';
  var MAX_IMAGE_DATA_URL_CHARS = 1600000;
  var PROTO_ROUTE_CLASS = 'harvous-prototype-route';
  var WALLPAPER_CLASS = 'harvous-proto-wallpaper';
  var WALLPAPER_IMAGE_CLASS = 'harvous-proto-wallpaper-image';
  var WALLPAPER_COLOR_CLASS = 'harvous-proto-wallpaper-color';
  /** Theme-aware fallback; resolved from critical :root tokens below. */
  var DEFAULT_CANVAS_BG = 'var(--pds-canvas-default)';

  var root = document.documentElement;
  root.classList.add(PROTO_ROUTE_CLASS);

  /* Critical CSS so the canvas vars + empty shell card paint before the bundle's
     prototype-tokens.css / prototype-shell.css load. Mirrors the html/body/#root
     rules in prototype-tokens.css and the .proto-shell-frame box in prototype-shell.css. */
  if (!document.getElementById('harvous-prototype-route-critical')) {
    var style = document.createElement('style');
    style.id = 'harvous-prototype-route-critical';
    style.textContent =
      ':root{' +
      '--pds-lch-bg-page:100% 0 0;' +
      '--pds-lch-border:0% 0 0 / 0.072;' +
      '--pds-lch-canvas-default:98.7% 0.005 92;' +
      '--pds-lch-text-primary:24% 0.01 285;' +
      '--pds-lch-text-secondary:24% 0.01 285 / 0.5;' +
      '--pds-lch-shadow-shell-a:0% 0 0 / 0.02;' +
      '--pds-lch-shadow-shell-b:0% 0 0 / 0.01;' +
      '--pds-bg-page:oklch(var(--pds-lch-bg-page));' +
      '--pds-border:oklch(var(--pds-lch-border));' +
      '--pds-canvas-default:oklch(var(--pds-lch-canvas-default));' +
      '--pds-text-primary:oklch(var(--pds-lch-text-primary));' +
      '--pds-text-secondary:oklch(var(--pds-lch-text-secondary));' +
      '--pds-shadow-shell:0 2px 12px oklch(var(--pds-lch-shadow-shell-a)),0 1px 3px oklch(var(--pds-lch-shadow-shell-b));' +
      'color-scheme:light dark;' +
      '}' +
      '@media (prefers-color-scheme:dark){' +
      ':root{' +
      '--pds-lch-bg-page:18% 0.01 285;' +
      '--pds-lch-border:100% 0 0 / 0.1;' +
      '--pds-lch-canvas-default:12% 0.01 285;' +
      '--pds-lch-text-primary:96% 0 0;' +
      '--pds-lch-text-secondary:96% 0 0 / 0.55;' +
      '--pds-lch-shadow-shell-a:0% 0 0 / 0.35;' +
      '--pds-lch-shadow-shell-b:0% 0 0 / 0.2;' +
      '--pds-text-primary:oklch(var(--pds-lch-text-primary));' +
      '--pds-text-secondary:oklch(var(--pds-lch-text-secondary));' +
      '}' +
      '}' +
      'html.' +
      PROTO_ROUTE_CLASS +
      '{background-color:var(--pds-canvas-bg,var(--pds-canvas-default)) !important;background-image:var(--pds-canvas-image,none) !important;background-size:cover;background-position:center;background-repeat:no-repeat;background-attachment:fixed;color-scheme:light dark}' +
      'html.' +
      PROTO_ROUTE_CLASS +
      ' body,html.' +
      PROTO_ROUTE_CLASS +
      ' #root{background-color:transparent !important}' +
      'html.' +
      PROTO_ROUTE_CLASS +
      ' #root{isolation:isolate}' +
      'html.' +
      PROTO_ROUTE_CLASS +
      ' #root::before{content:"";position:fixed;top:14px;left:14px;right:14px;bottom:14px;z-index:-1;border-radius:18px;background:var(--pds-bg-page);box-shadow:var(--pds-shadow-shell);pointer-events:none}' +
      'html.' +
      PROTO_ROUTE_CLASS +
      '.' +
      WALLPAPER_IMAGE_CLASS +
      ' #root::before{display:none}' +
      'html.' +
      PROTO_ROUTE_CLASS +
      '.' +
      WALLPAPER_IMAGE_CLASS +
      ' #root{isolation:auto}';
    document.head.appendChild(style);
  }

  var LEGACY_PAPER_LIGHT_HEX = '#f7f6f3';
  var LEGACY_PAPER_DARK_HEX = '#1a1a1c';

  function readBackground() {
    try {
      var raw = localStorage.getItem(PROTO_BG_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (
        parsed &&
        (parsed.kind === 'color' || parsed.kind === 'image') &&
        typeof parsed.value === 'string'
      ) {
        if (parsed.kind === 'image' && parsed.value.length > MAX_IMAGE_DATA_URL_CHARS) {
          localStorage.removeItem(PROTO_BG_KEY);
          return null;
        }
        if (
          parsed.kind === 'color' &&
          (parsed.value === LEGACY_PAPER_LIGHT_HEX || parsed.value === LEGACY_PAPER_DARK_HEX)
        ) {
          localStorage.removeItem(PROTO_BG_KEY);
          return null;
        }
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function applyBackground(bg) {
    var style = root.style;
    root.classList.remove(WALLPAPER_CLASS, WALLPAPER_IMAGE_CLASS, WALLPAPER_COLOR_CLASS);

    if (bg === null) {
      style.removeProperty('--pds-canvas-bg');
      style.removeProperty('--pds-canvas-image');
      return;
    }

    if (bg.kind === 'color') {
      style.setProperty('--pds-canvas-bg', bg.value);
      style.removeProperty('--pds-canvas-image');
      root.classList.add(WALLPAPER_COLOR_CLASS);
    } else {
      style.setProperty('--pds-canvas-bg', DEFAULT_CANVAS_BG);
      style.setProperty('--pds-canvas-image', 'url("' + bg.value + '")');
      root.classList.add(WALLPAPER_CLASS, WALLPAPER_IMAGE_CLASS);
    }
  }

  applyBackground(readBackground());
})();
