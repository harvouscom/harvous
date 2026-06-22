import appearancePresetsCatalog from '../../../shared/appearance-presets.json';
import appearanceImagePresetsCatalog, {
  type AppearanceImagePresetsCatalog as ImagePresetsCatalogJson,
} from './appearance-image-presets-data';

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
  | { kind: 'color'; value: string }
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
const CANVAS_DEFAULT_LIGHT_HEX = appearancePresetsCatalog.canvasDefaultLightHex;
const CANVAS_DEFAULT_DARK_HEX = appearancePresetsCatalog.canvasDefaultDarkHex;
const LEGACY_PAPER_LIGHT_HEX = appearancePresetsCatalog.legacyPaperLightHex;
const LEGACY_PAPER_DARK_HEX = appearancePresetsCatalog.legacyPaperDarkHex;

/** @deprecated Only used for parsing legacy single-key values during migration. */
const MAX_IMAGE_DATA_URL_CHARS = 1_600_000;

export type BgPreset = {
  label: string;
  /** Carousel label in dark mode; falls back to `label`. */
  darkLabel?: string;
  /** Stored canvas color in light mode; `null` = follow `--pds-canvas-default`. */
  light: string | null;
  /** Stored / preview color in dark mode; omit to reuse `light`. */
  dark?: string | null;
};

/** Solid-color presets — shared with native via `shared/appearance-presets.json`. */
export const BG_PRESETS: BgPreset[] = appearancePresetsCatalog.presets;

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
      return migrateLegacyPaper(parsed);
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

export function readBackgroundForMode(mode: 'light' | 'dark'): ProtoBg {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(modeKey(mode));
    if (raw !== null) return parseProtoBg(raw);
    return migrateLegacyToMode(mode);
  } catch {
    return null;
  }
}

export function writeBackgroundForMode(mode: 'light' | 'dark', bg: ProtoBg): void {
  try {
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
