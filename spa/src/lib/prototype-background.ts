import appearancePresetsCatalog from '../../../shared/appearance-presets.json';
import appearanceImagePresetsCatalog, {
  type AppearanceImagePresetsCatalog as ImagePresetsCatalogJson,
} from './appearance-image-presets-data';
import { api } from './api';
import {
  HARVOUS_APPEARANCE_ACCOUNT_SYNC,
  type AppearanceAccountSyncDetail,
} from '@/utils/harvous-appearance-account-event';

/**
 * Device-local customization of the canvas behind the prototype shell card
 * (the 14px gutter around `/prototype/*`). The chosen color/image is stored in
 * localStorage and applied as CSS custom properties on the document root —
 * `--pds-canvas-bg` / `--pds-canvas-image`, consumed by `prototype-tokens.css`.
 *
 * Custom uploads are data URLs (capped for localStorage). Image presets use
 * static URLs from public/images/prototype-backgrounds/{light|dark}/.
 *
 * First-paint boot (before React): keep active key/parsing in sync with
 * `public/scripts/prototype-route-boot.js` and `prototype-image-presets-catalog.js`.
 * Saved-image archive is settings-only (custom upload).
 */

export type ProtoBg =
  | { kind: 'color'; value: string; presetId?: string }
  | {
      kind: 'image-preset';
      presetId: string;
      /** Averaged or catalog shell tint (hex). */
      tint?: string;
    }
  | null;

/** @deprecated Single-key storage — kept for migration from older versions. */
export const PROTO_BG_KEY = 'harvous-proto-bg';
export const PROTO_BG_LIGHT_KEY = 'harvous-proto-bg-light';
export const PROTO_BG_DARK_KEY = 'harvous-proto-bg-dark';

/** `<html>` class while `/prototype/*` is active (see prototype-tokens.css). */
export const PROTO_ROUTE_CLASS = 'harvous-prototype-route';

/** Fallback canvas when no custom wallpaper is saved (theme-aware via CSS tokens). */
export const DEFAULT_CANVAS_BG = 'var(--pds-canvas-default)';

/**
 * Hex equivalents of `--pds-lch-canvas-default` in prototype-tokens.css
 * (light: 98.7% 0.005 92, dark: 12% 0.01 285). Used when lightening image shell tints.
 */
/** Matches :root --pds-lch-canvas-default in prototype-tokens.css */
export const CANVAS_DEFAULT_LIGHT_HEX = appearancePresetsCatalog.canvasDefaultLightHex;
export const CANVAS_DEFAULT_DARK_HEX = appearancePresetsCatalog.canvasDefaultDarkHex;

/** Catalog Paper/default canvas hex for a specific appearance mode (not live document theme). */
export function canvasDefaultHexForMode(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? CANVAS_DEFAULT_DARK_HEX : CANVAS_DEFAULT_LIGHT_HEX;
}
const LEGACY_PAPER_LIGHT_HEX = appearancePresetsCatalog.legacyPaperLightHex;
const LEGACY_PAPER_DARK_HEX = appearancePresetsCatalog.legacyPaperDarkHex;

/** @deprecated Only used for parsing legacy single-key values during migration. */
const MAX_IMAGE_DATA_URL_CHARS = 1_600_000;

export type BgPreset = {
  id: string;
  label: string;
  /** Carousel label in dark mode; falls back to `label`. */
  darkLabel?: string;
  /** Stored canvas color in light mode; `null` = follow `--pds-canvas-default`. */
  light: string | null;
  /** Stored / preview color in dark mode; omit to reuse `light`. */
  dark?: string | null;
};

/** Solid-color presets — shared with native via `shared/appearance-presets.json`. */
export const BG_PRESETS: BgPreset[] = appearancePresetsCatalog.presets as BgPreset[];

/** Look up a color preset by id. */
export function colorPresetById(id: string): BgPreset | undefined {
  return BG_PRESETS.find((p) => p.id === id);
}

/**
 * Resolve a stored `ProtoBg` color value against the current catalog.
 * If `presetId` is present and the preset exists, return the catalog's current
 * hex for the given mode — so updating `appearance-presets.json` propagates to
 * every user without re-picking. Falls back to the stored `value`.
 */
function resolveColorPreset(bg: { kind: 'color'; value: string; presetId?: string }, mode: 'light' | 'dark'): ProtoBg {
  if (bg.presetId) {
    const preset = colorPresetById(bg.presetId);
    if (preset) {
      const resolved = mode === 'dark'
        ? (preset.dark !== undefined ? preset.dark : preset.light)
        : preset.light;
      return resolved === null ? null : { kind: 'color', value: resolved, presetId: bg.presetId };
    }
  }
  return bg;
}

/**
 * Reverse map: old hex values that once shipped as preset colors → preset id.
 * Lets us auto-attach a `presetId` to existing stored values so they track
 * future catalog updates.
 */
const LEGACY_COLOR_HEX_TO_PRESET_ID: Record<string, string> = {
  // Pre-June-2026 values
  '#c2dcf8': 'sky', '#152536': 'sky',
  '#dec5ed': 'lilac', '#2a2438': 'lilac',
  '#fbc8ad': 'peach', '#382820': 'peach',
  '#c9e3b8': 'mint', '#1e2e22': 'mint',
  '#f3c8e0': 'pink', '#382030': 'pink',
  '#f6ecd6': 'cream', '#2e2818': 'cream',
};

// Also add current hex values so fresh picks resolve correctly on read.
for (const preset of BG_PRESETS) {
  if (preset.id === 'paper') continue;
  if (preset.light) LEGACY_COLOR_HEX_TO_PRESET_ID[preset.light] = preset.id;
  if (preset.dark) LEGACY_COLOR_HEX_TO_PRESET_ID[preset.dark] = preset.id;
}

export type BgImagePreset = {
  id: string;
  label: string;
  file: string;
  mode: 'light' | 'dark';
  tintLight?: string | null;
  tintDark?: string | null;
};

export type AppearanceImagePresetsCatalog = ImagePresetsCatalogJson;

const IMAGE_PRESETS_CATALOG = appearanceImagePresetsCatalog as AppearanceImagePresetsCatalog;

/** Static image wallpapers — catalog in shared/appearance-image-presets.json. */
export const IMAGE_PRESETS: BgImagePreset[] = IMAGE_PRESETS_CATALOG.presets;

export const IMAGE_PRESETS_LIGHT: BgImagePreset[] = IMAGE_PRESETS.filter((p) => p.mode === 'light');
export const IMAGE_PRESETS_DARK: BgImagePreset[] = IMAGE_PRESETS.filter((p) => p.mode === 'dark');

export const IMAGE_PRESETS_BASE_PATH = IMAGE_PRESETS_CATALOG.basePath;

// ─── Color scheme preference ─────────────────────────────────────────────────

export const PROTO_COLOR_SCHEME_KEY = 'harvous-proto-color-scheme';
export type ColorSchemePreference = 'system' | 'light' | 'dark';
const COLOR_SCHEME_CHANGE_EVENT = 'harvous-color-scheme-change';

export function readColorSchemePreference(): ColorSchemePreference {
  try {
    const raw = localStorage.getItem(PROTO_COLOR_SCHEME_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch { /* ignore */ }
  return 'system';
}

export function applyColorSchemePreference(pref: ColorSchemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') {
    root.setAttribute('data-color-scheme', pref);
  } else {
    root.removeAttribute('data-color-scheme');
  }
}

export function writeColorSchemePreference(pref: ColorSchemePreference): void {
  try {
    if (pref === 'system') {
      localStorage.removeItem(PROTO_COLOR_SCHEME_KEY);
    } else {
      localStorage.setItem(PROTO_COLOR_SCHEME_KEY, pref);
    }
  } catch { /* ignore */ }
  applyColorSchemePreference(pref);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(COLOR_SCHEME_CHANGE_EVENT));
  }
}

// ─── Color scheme detection ───────────────────────────────────────────────────

export function isDarkAppearance(): boolean {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-color-scheme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
  }
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function subscribeColorScheme(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onStoreChange);
  window.addEventListener(COLOR_SCHEME_CHANGE_EVENT, onStoreChange);
  return () => {
    mq.removeEventListener('change', onStoreChange);
    window.removeEventListener(COLOR_SCHEME_CHANGE_EVENT, onStoreChange);
  };
}

export function getColorSchemeSnapshot(): 'light' | 'dark' {
  return isDarkAppearance() ? 'dark' : 'light';
}

/** Swatch fill for the Appearance picker — follows the active system theme. */
export function presetSwatchColor(preset: BgPreset): string {
  const dark = isDarkAppearance();
  if (dark && preset.dark !== undefined) {
    return preset.dark === null ? 'var(--pds-canvas-default)' : preset.dark;
  }
  return preset.light === null ? 'var(--pds-canvas-default)' : preset.light;
}

/** Theme-aware carousel label (e.g. Cream → Umber in dark mode). */
export function presetDisplayLabel(preset: BgPreset, scheme: 'light' | 'dark' = getColorSchemeSnapshot()): string {
  if (scheme === 'dark') {
    return preset.darkLabel ?? preset.label;
  }
  return preset.label;
}

/** Value to persist when the user picks a preset in the current theme. */
export function presetApplyValue(preset: BgPreset): ProtoBg {
  const dark = isDarkAppearance();
  if (dark && preset.dark !== undefined) {
    return preset.dark === null ? null : { kind: 'color', value: preset.dark };
  }
  return preset.light === null ? null : { kind: 'color', value: preset.light };
}

export function isPresetSelected(preset: BgPreset, bg: ProtoBg): boolean {
  const isPaperPreset =
    preset.light === null && (preset.dark === null || preset.dark === undefined);
  if (isPaperPreset) return bg === null;
  if (bg?.kind !== 'color') return false;
  const candidates = [preset.light, preset.dark].filter((v): v is string => typeof v === 'string');
  return candidates.includes(bg.value);
}

export function imagePresetById(id: string): BgImagePreset | undefined {
  return IMAGE_PRESETS.find((preset) => preset.id === id);
}

/** Static URL for a catalog image preset (mode is intrinsic to the preset). */
export function imagePresetUrl(preset: BgImagePreset): string {
  return `${IMAGE_PRESETS_BASE_PATH}/${preset.mode}/${preset.file}`;
}

/** Value to persist when the user picks an image preset. */
export function imagePresetApplyValue(preset: BgImagePreset): ProtoBg {
  return { kind: 'image-preset', presetId: preset.id };
}

export function isImagePresetSelected(preset: BgImagePreset, bg: ProtoBg): boolean {
  return bg?.kind === 'image-preset' && bg.presetId === preset.id;
}

/** Optional catalog tint for the preset's intrinsic mode. */
export function imagePresetCatalogTint(preset: BgImagePreset): string | undefined {
  const raw = preset.mode === 'dark' ? preset.tintDark : preset.tintLight;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

type ImageWallpaperBg = Extract<ProtoBg, { kind: 'image-preset' }>;

function isImageWallpaper(bg: NonNullable<ProtoBg>): bg is ImageWallpaperBg {
  return bg.kind === 'image-preset';
}

function wallpaperImageUrl(bg: ImageWallpaperBg): string {
  const preset = imagePresetById(bg.presetId);
  return preset ? imagePresetUrl(preset) : '';
}

function migrateLegacyPaper(bg: ProtoBg): ProtoBg {
  if (bg?.kind !== 'color') return bg;
  if (bg.value === LEGACY_PAPER_LIGHT_HEX || bg.value === LEGACY_PAPER_DARK_HEX) {
    return null;
  }
  return bg;
}

function normalizeImagePresetId(id: string): string {
  if (id === 'mist') return 'meadow';
  if (id === 'shade' || id === 'stone' || id === 'dusk') return 'cinder';
  return id;
}

function parseProtoBg(raw: string | null): ProtoBg {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.kind === 'image-preset' && typeof parsed.presetId === 'string') {
      const presetId = normalizeImagePresetId(parsed.presetId);
      if (!imagePresetById(presetId)) return null;
      return presetId === parsed.presetId ? parsed : { ...parsed, presetId };
    }
    if (parsed && parsed.kind === 'color' && typeof parsed.value === 'string') {
      const bg = migrateLegacyPaper(parsed);
      if (!bg) return null;
      if (!bg.presetId) {
        const inferredId = LEGACY_COLOR_HEX_TO_PRESET_ID[bg.value.toLowerCase()];
        if (inferredId) return { ...bg, presetId: inferredId };
      }
      return bg;
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse the old single-key value (may contain legacy `kind: 'image'` entries). */
function parseLegacyBg(raw: string | null): { kind: 'color'; value: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.kind === 'color' && typeof parsed.value === 'string') {
      if (parsed.value === LEGACY_PAPER_LIGHT_HEX || parsed.value === LEGACY_PAPER_DARK_HEX) {
        return null;
      }
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** One-time migration: resolve the old single-key color for a specific mode. */
function migrateLegacyToMode(mode: 'light' | 'dark'): ProtoBg {
  if (typeof localStorage === 'undefined') return null;
  try {
    const legacy = parseLegacyBg(localStorage.getItem(PROTO_BG_KEY));
    if (!legacy) return null;
    for (const preset of BG_PRESETS) {
      const candidates = [preset.light, preset.dark].filter((v): v is string => typeof v === 'string');
      if (candidates.includes(legacy.value)) {
        const resolved = mode === 'dark'
          ? (preset.dark !== undefined ? preset.dark : preset.light)
          : preset.light;
        return resolved === null ? null : { kind: 'color', value: resolved };
      }
    }
    return legacy;
  } catch {
    return null;
  }
}

// ─── Per-mode read / write ───────────────────────────────────────────────────

function modeKey(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? PROTO_BG_DARK_KEY : PROTO_BG_LIGHT_KEY;
}

/** True once either per-mode wallpaper key has been written (missing key = Paper). */
function hasPerModeBackgroundStorage(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return (
      localStorage.getItem(PROTO_BG_LIGHT_KEY) !== null ||
      localStorage.getItem(PROTO_BG_DARK_KEY) !== null
    );
  } catch {
    return false;
  }
}

export function readBackgroundForMode(mode: 'light' | 'dark'): ProtoBg {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(modeKey(mode));
    if (raw !== null) {
      const bg = parseProtoBg(raw);
      if (bg?.kind === 'color') return resolveColorPreset(bg, mode);
      return bg;
    }
    if (hasPerModeBackgroundStorage()) return null;
    const bg = migrateLegacyToMode(mode);
    if (bg?.kind === 'color') return resolveColorPreset(bg, mode);
    return bg;
  } catch {
    return null;
  }
}

/** iOS home-screen PWA — WebKit is prone to renderer kills with image wallpapers + blur. */
export function isIosStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isPwa =
    window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && isPwa;
}

/**
 * Reduce compositor cost on iOS standalone at mobile widths.
 *
 * The reduction is now entirely CSS-side (see prototype-shell.css): shell blur off, and
 * the canvas image painted with `background-attachment: scroll`. Both were the expensive
 * half of the renderer kills — a `fixed` backdrop makes WebKit re-composite the whole
 * image on every scroll, and layering blur over it compounds that. The image itself is a
 * single cover-sized paint, so it no longer has to be thrown away with them.
 */
export function shouldReducePrototypeCompositorOnMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return isIosStandalonePwa() && window.matchMedia('(max-width: 899px)').matches;
}

export function writeBackgroundForMode(mode: 'light' | 'dark', bg: ProtoBg): void {
  try {
    // Per-mode keys supersede the deprecated single-key storage.
    localStorage.removeItem(PROTO_BG_KEY);
    const key = modeKey(mode);
    if (bg === null) {
      localStorage.removeItem(key);
    } else {
      if (bg.kind === 'image-preset' && !imagePresetById(bg.presetId)) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(bg));
    }
  } catch {
    /* ignore (private mode / quota) */
  }
}

export function readActiveBackground(): ProtoBg {
  return readBackgroundForMode(isDarkAppearance() ? 'dark' : 'light');
}

// ─── Wallpaper classes ───────────────────────────────────────────────────────

/** Image wallpaper: full chrome material overrides. */
export const WALLPAPER_CLASS = 'harvous-proto-wallpaper';
/** Class on <html> while an image wallpaper is active. */
export const WALLPAPER_IMAGE_CLASS = 'harvous-proto-wallpaper-image';
/** Class on <html> while a solid color canvas preset is active (border hue + popover opacity). */
export const WALLPAPER_COLOR_CLASS = 'harvous-proto-wallpaper-color';

const TINT_SAMPLE_EDGE = 32;

/** Apply classes and canvas vars synchronously (image uses stored tint or theme default until sampled). */
export function applyBackground(bg: ProtoBg): void {
  const root = document.documentElement;
  const style = root.style;

  if (bg === null) {
    clearBackgroundVars();
    return;
  }
  if (bg.kind === 'color') {
    style.setProperty('--pds-canvas-bg', bg.value);
    style.removeProperty('--pds-canvas-image');
    root.classList.remove(WALLPAPER_CLASS, WALLPAPER_IMAGE_CLASS, WALLPAPER_COLOR_CLASS);
    root.classList.add(WALLPAPER_COLOR_CLASS);
    return;
  }

  const url = wallpaperImageUrl(bg);
  style.setProperty('--pds-canvas-bg', imageCanvasTint(bg));
  if (url) {
    style.setProperty('--pds-canvas-image', `url("${url}")`);
  } else {
    style.removeProperty('--pds-canvas-image');
  }
  root.classList.remove(WALLPAPER_CLASS, WALLPAPER_IMAGE_CLASS, WALLPAPER_COLOR_CLASS);
  root.classList.add(WALLPAPER_CLASS, WALLPAPER_IMAGE_CLASS);
}

/** Apply background and, for images, sample + persist a shell tint when missing. */
export async function applyBackgroundWithImageTint(bg: ProtoBg): Promise<void> {
  applyBackground(bg);
  if (!bg || !isImageWallpaper(bg)) return;

  const url = wallpaperImageUrl(bg);
  if (!url) return;

  const preset = imagePresetById(bg.presetId);
  const catalogTint = preset ? imagePresetCatalogTint(preset) : undefined;
  const rawTint = bg.tint;
  const sampledTint = rawTint ?? catalogTint ?? (await sampleImageTint(url));
  const canvasTint = tintForAppearance(sampledTint);
  document.documentElement.style.setProperty('--pds-canvas-bg', canvasTint);

  if (rawTint !== sampledTint) {
    const updated: ProtoBg = { kind: 'image-preset', presetId: bg.presetId, tint: sampledTint };
    const mode = preset?.mode ?? (isDarkAppearance() ? 'dark' : 'light');
    writeBackgroundForMode(mode, updated);
  }
}

function imageCanvasTint(bg: ImageWallpaperBg): string {
  if (bg.tint) return tintForAppearance(bg.tint);
  const preset = imagePresetById(bg.presetId);
  const catalogTint = preset ? imagePresetCatalogTint(preset) : undefined;
  if (catalogTint) return tintForAppearance(catalogTint);
  return DEFAULT_CANVAS_BG;
}

/** Average color from a downscaled decode — used for shell glass, not the html wallpaper. */
export async function sampleImageTint(imageSrc: string): Promise<string> {
  if (typeof document === 'undefined') return '#f7f6f3';
  try {
    const img = await loadImageForTint(imageSrc);
    const canvas = document.createElement('canvas');
    const edge = TINT_SAMPLE_EDGE;
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '#f7f6f3';
    ctx.drawImage(img, 0, 0, edge, edge);
    const { data } = ctx.getImageData(0, 0, edge, edge);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (n === 0) return defaultCanvasHex();
    return rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n));
  } catch {
    return defaultCanvasHex();
  }
}

/** Map a raw photo average to shell `--pds-canvas-bg` (blend toward theme default canvas). */
export function tintForAppearance(hex: string): string {
  return blendHex(hex, defaultCanvasHex(), 0.8);
}

function defaultCanvasHex(): string {
  return isDarkAppearance() ? CANVAS_DEFAULT_DARK_HEX : CANVAS_DEFAULT_LIGHT_HEX;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function blendHex(from: string, to: string, amount: number): string {
  const a = parseHexRgb(from);
  const b = parseHexRgb(to);
  if (!a || !b) return to;
  const t = Math.min(1, Math.max(0, amount));
  return rgbToHex(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t),
  );
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return null;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function loadImageForTint(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-load-failed'));
    img.src = src;
  });
}

/** Remove the inline canvas vars / classes so a custom background doesn't leak to other routes. */
export function clearBackgroundVars(): void {
  const root = document.documentElement;
  root.style.removeProperty('--pds-canvas-bg');
  root.style.removeProperty('--pds-canvas-image');
  root.classList.remove(WALLPAPER_CLASS, WALLPAPER_IMAGE_CLASS, WALLPAPER_COLOR_CLASS);
}

/** Remove prototype first-paint boot (wallpaper + shell card) on public routes. */
export function clearPrototypeRouteBoot(): void {
  const root = document.documentElement;
  root.classList.remove(PROTO_ROUTE_CLASS);
  clearBackgroundVars();
  root.style.removeProperty('background-color');
  root.style.removeProperty('background-image');
  document.body.style.removeProperty('background-color');
  document.getElementById('root')?.style.removeProperty('background-color');
}

// ─── Account sync (cross-device) ─────────────────────────────────────────────
//
// The account (`UserMetadata.appearanceSettings`) is the source of truth;
// the three localStorage keys above are this device's first-paint cache. The
// shared sync layer applies the column on bootstrap/changes/realtime and emits
// `HARVOUS_APPEARANCE_ACCOUNT_SYNC`; here we hydrate the cache + repaint.
//
// "Account always wins" — except (a) when the account has never stored
// appearance (`null`), we seed it once from this device, and (b) while a local
// edit is still un-pushed (offline), the pending marker suppresses hydration so
// the edit isn't clobbered before it reaches the server.

/** localStorage marker holding a serialized local edit awaiting push to the account. */
export const PROTO_APPEARANCE_PENDING_KEY = 'harvous-proto-appearance-pending';
const APPEARANCE_UPDATE_ENDPOINT = '/api/user/update-appearance';

export interface AccountAppearanceSettings {
  colorScheme: ColorSchemePreference;
  bgLight: ProtoBg;
  bgDark: ProtoBg;
}

/** Snapshot the device's current local appearance for pushing to the account. */
export function readLocalAppearanceSettings(): AccountAppearanceSettings {
  return {
    colorScheme: readColorSchemePreference(),
    bgLight: readBackgroundForMode('light'),
    bgDark: readBackgroundForMode('dark'),
  };
}

function serializeAppearance(s: AccountAppearanceSettings): string {
  return JSON.stringify({ colorScheme: s.colorScheme, bgLight: s.bgLight, bgDark: s.bgDark });
}

/** Parse + validate the account JSON, reusing `parseProtoBg` for the backgrounds. */
function parseAccountAppearance(raw: string | null): AccountAppearanceSettings | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (!obj || typeof obj !== 'object') return null;
    const cs = obj.colorScheme;
    const colorScheme: ColorSchemePreference = cs === 'light' || cs === 'dark' ? cs : 'system';
    return {
      colorScheme,
      bgLight: parseProtoBg(obj.bgLight == null ? null : JSON.stringify(obj.bgLight)),
      bgDark: parseProtoBg(obj.bgDark == null ? null : JSON.stringify(obj.bgDark)),
    };
  } catch {
    return null;
  }
}

function readPendingAppearance(): string | null {
  try { return localStorage.getItem(PROTO_APPEARANCE_PENDING_KEY); } catch { return null; }
}
function setPendingAppearance(raw: string): void {
  try { localStorage.setItem(PROTO_APPEARANCE_PENDING_KEY, raw); } catch { /* ignore */ }
}
function clearPendingAppearance(): void {
  try { localStorage.removeItem(PROTO_APPEARANCE_PENDING_KEY); } catch { /* ignore */ }
}

/** Push any pending local edit to the account. Keeps the marker on failure (offline) so it retries. */
async function flushPendingAppearance(): Promise<boolean> {
  const raw = readPendingAppearance();
  if (!raw) return true;
  const parsed = parseAccountAppearance(raw);
  if (!parsed) { clearPendingAppearance(); return true; }
  try {
    const res = await api.post<{ appearanceSettings?: string }>(APPEARANCE_UPDATE_ENDPOINT, {
      colorScheme: parsed.colorScheme,
      bgLight: parsed.bgLight,
      bgDark: parsed.bgDark,
    });
    if (typeof res.appearanceSettings === 'string') {
      lastKnownAccountAppearanceRaw = res.appearanceSettings;
    }
    // Only clear if no newer edit landed while the request was in flight.
    if (readPendingAppearance() === raw) clearPendingAppearance();
    return true;
  } catch {
    /* keep pending; retried on `online` / next init */
    appearanceSeedAttempted = false;
    return false;
  }
}

let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Last account JSON seen from the server — used to skip no-op pushes. */
let lastKnownAccountAppearanceRaw: string | null = null;

function localAppearanceMatchesAccount(localSerialized: string): boolean {
  if (lastKnownAccountAppearanceRaw == null) return false;
  const local = parseAccountAppearance(localSerialized);
  const account = parseAccountAppearance(lastKnownAccountAppearanceRaw);
  if (!local || !account) return false;
  return serializeAppearance(local) === serializeAppearance(account);
}

/**
 * Write-through: persist the device's current local appearance to the account.
 * Marks it pending synchronously (durable across reload/offline), then debounces
 * the network flush so rapid preset taps collapse into one request.
 */
export function schedulePushAppearanceToAccount(delayMs = 500): void {
  const serialized = serializeAppearance(readLocalAppearanceSettings());
  if (localAppearanceMatchesAccount(serialized)) return;
  setPendingAppearance(serialized);
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => { void flushPendingAppearance(); }, delayMs);
}

/**
 * Apply an account appearance value to this device: write the localStorage cache
 * and repaint. No-op when a local edit is still pending (local wins until pushed).
 */
export function hydrateAppearanceFromAccount(raw: string | null): void {
  if (readPendingAppearance()) return;
  const settings = parseAccountAppearance(raw);
  if (!settings) return;
  writeColorSchemePreference(settings.colorScheme); // applies scheme + fires change event
  writeBackgroundForMode('light', settings.bgLight);
  writeBackgroundForMode('dark', settings.bgDark);
  void applyBackgroundWithImageTint(readActiveBackground());
}

let appearanceSeedAttempted = false;

/** Route an account-sync payload: seed when the account is empty, else hydrate. */
function handleAppearanceAccountSync(raw: string | null): void {
  if (raw == null) {
    if (appearanceSeedAttempted) return;
    appearanceSeedAttempted = true;
    schedulePushAppearanceToAccount(0); // seed from this device once
    return;
  }
  lastKnownAccountAppearanceRaw = raw;
  hydrateAppearanceFromAccount(raw);
}

let appearanceAccountSyncInit = false;

/**
 * Fetch `appearanceSettings` from the profile endpoint and hydrate/seed.
 * Used both on init and when a `userMetadata:updated` realtime event arrives.
 */
export async function fetchAndHydrateAppearanceFromProfile(): Promise<void> {
  try {
    const profile = await api.get<{ appearanceSettings?: string | null }>('/api/user/get-profile');
    handleAppearanceAccountSync(profile.appearanceSettings ?? null);
  } catch {
    /* offline or not signed in — local cache is fine */
  }
}

/**
 * Wire account → device appearance sync. Idempotent; call once on prototype mount.
 * Does not fetch profile — call {@link fetchAndHydrateAppearanceFromProfile} after Clerk is signed in.
 */
export function initAppearanceAccountSync(): void {
  if (appearanceAccountSyncInit || typeof window === 'undefined') return;
  appearanceAccountSyncInit = true;
  // Listen for events from the IndexedDB sync path (non-prototype routes).
  window.addEventListener(HARVOUS_APPEARANCE_ACCOUNT_SYNC, (e) => {
    const detail = (e as CustomEvent<AppearanceAccountSyncDetail>).detail;
    handleAppearanceAccountSync(detail?.appearanceSettings ?? null);
  });
  window.addEventListener('online', () => { void flushPendingAppearance(); });
  void flushPendingAppearance(); // flush an edit left pending from a previous session
}
