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
 * and public/scripts/prototype-image-presets-catalog.js (generated from
 * shared/appearance-image-presets.json). Saved-image archive is settings-only.
 */
(function prototypeRouteBoot() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var PROTO_COLOR_SCHEME_KEY = 'harvous-proto-color-scheme';
  var root = document.documentElement;

  /* Apply stored color scheme on every page load (before route early returns). */
  try {
    var colorSchemePref = localStorage.getItem(PROTO_COLOR_SCHEME_KEY);
    if (colorSchemePref === 'light' || colorSchemePref === 'dark') {
      root.setAttribute('data-color-scheme', colorSchemePref);
    }
  } catch (e) { /* ignore — localStorage may be unavailable */ }

  var path = window.location.pathname;
  var host = window.location.hostname;
  var shellPath = window.__harvousPrototypeShellPath;
  if (!shellPath || !shellPath.isPrototypeShellPath(path, host)) {
    return;
  }

  /** iOS standalone PWA: skip image wallpapers at first paint (WebKit compositor OOM). */
  function isIosStandalonePwa() {
    var ua = navigator.userAgent || '';
    var isIos = /iPhone|iPad|iPod/.test(ua);
    var isPwa =
      window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true;
    return isIos && isPwa;
  }

  function shouldReduceCompositorLoad() {
    return isIosStandalonePwa() && window.matchMedia('(max-width: 899px)').matches;
  }

  var PROTO_BG_KEY = 'harvous-proto-bg';
  var PROTO_BG_LIGHT_KEY = 'harvous-proto-bg-light';
  var PROTO_BG_DARK_KEY = 'harvous-proto-bg-dark';
  var PROTO_ROUTE_CLASS = 'harvous-prototype-route';
  var WALLPAPER_CLASS = 'harvous-proto-wallpaper';
  var WALLPAPER_IMAGE_CLASS = 'harvous-proto-wallpaper-image';
  var WALLPAPER_COLOR_CLASS = 'harvous-proto-wallpaper-color';
  /** Theme-aware fallback; resolved from critical :root tokens below. */
  var DEFAULT_CANVAS_BG = 'var(--pds-canvas-default)';

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
      '[data-color-scheme="light"]{color-scheme:light}' +
      '[data-color-scheme="dark"]{color-scheme:dark}' +
      '@media (prefers-color-scheme:dark){' +
      ':root:not([data-color-scheme="light"]){' +
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
      ':root[data-color-scheme="dark"]{' +
      '--pds-lch-bg-page:18% 0.01 285;' +
      '--pds-lch-border:100% 0 0 / 0.1;' +
      '--pds-lch-canvas-default:12% 0.01 285;' +
      '--pds-lch-text-primary:96% 0 0;' +
      '--pds-lch-text-secondary:96% 0 0 / 0.55;' +
      '--pds-lch-shadow-shell-a:0% 0 0 / 0.35;' +
      '--pds-lch-shadow-shell-b:0% 0 0 / 0.2;' +
      '--pds-bg-page:oklch(var(--pds-lch-bg-page));' +
      '--pds-border:oklch(var(--pds-lch-border));' +
      '--pds-canvas-default:oklch(var(--pds-lch-canvas-default));' +
      '--pds-text-primary:oklch(var(--pds-lch-text-primary));' +
      '--pds-text-secondary:oklch(var(--pds-lch-text-secondary));' +
      '--pds-shadow-shell:0 2px 12px oklch(var(--pds-lch-shadow-shell-a)),0 1px 3px oklch(var(--pds-lch-shadow-shell-b));' +
      '}' +
      'html.' +
      PROTO_ROUTE_CLASS +
      '{--pds-shell-frame-inset:14px;--pds-shell-frame-radius:18px;background-color:var(--pds-canvas-bg,var(--pds-canvas-default)) !important;background-image:var(--pds-canvas-image,none) !important;background-size:cover;background-position:center;background-repeat:no-repeat;background-attachment:fixed}' +
      '@media (max-width:899px){html.' +
      PROTO_ROUTE_CLASS +
      '{--pds-shell-frame-inset:8px}}' +
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
      ' #root::before{content:"";position:fixed;inset:var(--pds-shell-frame-inset);z-index:-1;border-radius:var(--pds-shell-frame-radius);background:var(--pds-bg-page);box-shadow:var(--pds-shadow-shell);pointer-events:none}' +
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

  function isDarkAppearance() {
    var attr = root.getAttribute('data-color-scheme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function imagePresetCatalog() {
    return window.__HARVOUS_APPEARANCE_IMAGE_PRESETS || { basePath: '/images/prototype-backgrounds', presets: [] };
  }

  function imagePresetById(id) {
    var catalog = imagePresetCatalog();
    for (var i = 0; i < catalog.presets.length; i++) {
      if (catalog.presets[i].id === id) return catalog.presets[i];
    }
    return null;
  }

  function imagePresetUrl(preset) {
    var catalog = imagePresetCatalog();
    return catalog.basePath + '/' + (preset.mode || 'light') + '/' + preset.file;
  }

  function parseBg(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.kind === 'image-preset' && typeof parsed.presetId === 'string') {
        var presetId =
          parsed.presetId === 'mist'
            ? 'meadow'
            : parsed.presetId === 'shade' || parsed.presetId === 'stone' || parsed.presetId === 'dusk'
              ? 'cinder'
              : parsed.presetId;
        if (!imagePresetById(presetId)) return null;
        return presetId === parsed.presetId ? parsed : { kind: 'image-preset', presetId: presetId, tint: parsed.tint };
      }
      if (parsed && parsed.kind === 'color' && typeof parsed.value === 'string') {
        if (parsed.value === LEGACY_PAPER_LIGHT_HEX || parsed.value === LEGACY_PAPER_DARK_HEX) {
          return null;
        }
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function readBackground() {
    try {
      var modeKey = isDarkAppearance() ? PROTO_BG_DARK_KEY : PROTO_BG_LIGHT_KEY;
      var raw = localStorage.getItem(modeKey);
      if (raw !== null) return parseBg(raw);
      return parseBg(localStorage.getItem(PROTO_BG_KEY));
    } catch (e) {
      return null;
    }
  }

  function wallpaperImageUrl(bg) {
    if (bg.kind === 'image') return bg.value;
    var preset = imagePresetById(bg.presetId);
    return preset ? imagePresetUrl(preset) : '';
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
      return;
    }

    var url = wallpaperImageUrl(bg);
    style.setProperty('--pds-canvas-bg', DEFAULT_CANVAS_BG);
    if (url) {
      style.setProperty('--pds-canvas-image', 'url("' + url + '")');
    } else {
      style.removeProperty('--pds-canvas-image');
    }
    root.classList.add(WALLPAPER_CLASS, WALLPAPER_IMAGE_CLASS);
  }

  var bootBg = readBackground();
  if (shouldReduceCompositorLoad() && bootBg && bootBg.kind === 'image-preset') {
    bootBg = null;
  }
  applyBackground(bootBg);
})();
