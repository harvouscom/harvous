import appearancePresetsCatalog from '../../../shared/appearance-presets.json';

/**
 * Device-local customization of the canvas behind the prototype shell card
 * (the 14px gutter around `/prototype/*`). The chosen color/image is stored in
 * localStorage and applied as CSS custom properties on the document root —
 * `--pds-canvas-bg` / `--pds-canvas-image`, consumed by `prototype-tokens.css`.
 *
 * No backend: per-device only. Images are stored as data URLs, so we cap their
 * size to stay well under the ~5 MB localStorage quota.
 *
 * First-paint boot (before React): keep active key/parsing in sync with
 * `public/scripts/prototype-route-boot.js`. Saved-image archive is settings-only.
 */

export type ProtoBg =
  | { kind: 'color'; value: string }
  | {
      kind: 'image';
      value: string /* data URL */;
      /** Averaged shell tint (hex) so glass matches color-preset behavior. */
      tint?: string;
    }
  | null;

/** Archived upload so switching to a color preset does not discard the photo. */
export type ProtoSavedImage = {
  value: string /* data URL */;
  tint?: string;
};

export const PROTO_BG_KEY = 'harvous-proto-bg';
export const PROTO_SAVED_IMAGE_KEY = 'harvous-proto-bg-saved-image';

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

/** Reject uploads larger than this (data URLs inflate ~33% over raw bytes). */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB
/** Guardrail for persisted data-URL size (very large values can crash browser tabs). */
export const MAX_IMAGE_DATA_URL_CHARS = 1_600_000;

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

export function isDarkAppearance(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function subscribeColorScheme(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
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

/** Map stored bg to the correct variant for the current OS scheme (no storage write). */
export function resolveBackgroundForScheme(bg: ProtoBg): ProtoBg {
  if (bg === null) return null;
  if (bg.kind === 'image') return bg;
  for (const preset of BG_PRESETS) {
    if (isPresetSelected(preset, bg)) {
      return presetApplyValue(preset);
    }
  }
  return bg;
}

export function isPhotoSelected(bg: ProtoBg): boolean {
  return bg?.kind === 'image';
}

export function isPhotoAvailable(savedImage: ProtoSavedImage | null): boolean {
  return savedImage !== null && savedImage.value.length > 0;
}

function migrateLegacyPaper(bg: ProtoBg): ProtoBg {
  if (bg?.kind !== 'color') return bg;
  if (bg.value === LEGACY_PAPER_LIGHT_HEX || bg.value === LEGACY_PAPER_DARK_HEX) {
    return null;
  }
  return bg;
}

function parseProtoBg(raw: string | null): ProtoBg {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProtoBg;
    if (
      parsed &&
      (parsed.kind === 'color' || parsed.kind === 'image') &&
      typeof parsed.value === 'string'
    ) {
      if (parsed.kind === 'image' && parsed.value.length > MAX_IMAGE_DATA_URL_CHARS) {
        return null;
      }
      if (parsed.kind === 'color') {
        const migrated = migrateLegacyPaper(parsed);
        if (migrated === null && parsed !== null) {
          try {
            localStorage.removeItem(PROTO_BG_KEY);
          } catch {
            /* ignore */
          }
        }
        return migrated;
      }
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function parseSavedImage(raw: string | null): ProtoSavedImage | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProtoSavedImage;
    if (parsed && typeof parsed.value === 'string') {
      if (parsed.value.length > MAX_IMAGE_DATA_URL_CHARS) return null;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Copy active image into the archive when upgrading from the single-key model. */
function migrateSavedImageFromActive(active: ProtoBg): void {
  if (active?.kind !== 'image') return;
  if (parseSavedImage(localStorage.getItem(PROTO_SAVED_IMAGE_KEY))) return;
  writeSavedImage({ value: active.value, tint: active.tint });
}

/** Read the saved preference, tolerating missing/corrupt values. */
export function readBackground(): ProtoBg {
  if (typeof localStorage === 'undefined') return null;
  try {
    const parsed = parseProtoBg(localStorage.getItem(PROTO_BG_KEY));
    if (parsed?.kind === 'image' && parsed.value.length > MAX_IMAGE_DATA_URL_CHARS) {
      localStorage.removeItem(PROTO_BG_KEY);
      return null;
    }
    if (parsed?.kind === 'image') migrateSavedImageFromActive(parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** Read the archived photo (independent of the active color/image choice). */
export function readSavedImage(): ProtoSavedImage | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const active = parseProtoBg(localStorage.getItem(PROTO_BG_KEY));
    if (active?.kind === 'image') migrateSavedImageFromActive(active);
    return parseSavedImage(localStorage.getItem(PROTO_SAVED_IMAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist the active background (or clear it when `null`). */
export function writeBackground(bg: ProtoBg): void {
  setActiveBackground(bg);
}

/** Persist the active background (or clear it when `null`). */
export function setActiveBackground(bg: ProtoBg): void {
  try {
    if (bg === null) {
      localStorage.removeItem(PROTO_BG_KEY);
    } else {
      if (bg.kind === 'image' && bg.value.length > MAX_IMAGE_DATA_URL_CHARS) {
        localStorage.removeItem(PROTO_BG_KEY);
        return;
      }
      localStorage.setItem(PROTO_BG_KEY, JSON.stringify(bg));
    }
  } catch {
    /* ignore (private mode / quota) */
  }
}

/** Persist or clear the archived photo. */
export function writeSavedImage(image: ProtoSavedImage | null): void {
  try {
    if (image === null) {
      localStorage.removeItem(PROTO_SAVED_IMAGE_KEY);
    } else {
      if (image.value.length > MAX_IMAGE_DATA_URL_CHARS) {
        localStorage.removeItem(PROTO_SAVED_IMAGE_KEY);
        return;
      }
      localStorage.setItem(PROTO_SAVED_IMAGE_KEY, JSON.stringify(image));
    }
  } catch {
    /* ignore (private mode / quota) */
  }
}

/** Archive an upload and make it the active wallpaper. */
export function saveUploadedImage(dataUrl: string, tint?: string): ProtoBg {
  const saved: ProtoSavedImage = { value: dataUrl, tint };
  writeSavedImage(saved);
  const active: ProtoBg = { kind: 'image', value: dataUrl, tint };
  setActiveBackground(active);
  return active;
}

/** Restore the archived photo as the active wallpaper. Returns null when none saved. */
export function selectSavedImage(): ProtoBg | null {
  const saved = readSavedImage();
  if (!saved) return null;
  const active: ProtoBg = { kind: 'image', value: saved.value, tint: saved.tint };
  setActiveBackground(active);
  return active;
}

/** Clear the archived photo; reset active to Paper when it was the wallpaper. */
export function removeSavedImage(): ProtoBg {
  const active = parseProtoBg(localStorage.getItem(PROTO_BG_KEY));
  writeSavedImage(null);
  if (active?.kind === 'image') {
    setActiveBackground(null);
    return null;
  }
  return active;
}

/** Image wallpaper: full chrome material overrides. */
export const WALLPAPER_CLASS = 'harvous-proto-wallpaper';
/** Class on <html> while an image wallpaper is active. */
export const WALLPAPER_IMAGE_CLASS = 'harvous-proto-wallpaper-image';
/** Class on <html> while a solid color canvas preset is active (border hue + popover opacity). */
export const WALLPAPER_COLOR_CLASS = 'harvous-proto-wallpaper-color';

const TINT_SAMPLE_EDGE = 32;

/** Apply classes and canvas vars synchronously (image uses stored tint or theme default until sampled). */
export function applyBackground(bg: ProtoBg): void {
  const resolved = resolveBackgroundForScheme(bg);
  const root = document.documentElement;
  const style = root.style;

  if (resolved === null) {
    clearBackgroundVars();
    return;
  }
  if (resolved.kind === 'color') {
    style.setProperty('--pds-canvas-bg', resolved.value);
    style.removeProperty('--pds-canvas-image');
  } else {
    style.setProperty('--pds-canvas-bg', imageCanvasTint(resolved));
    style.setProperty('--pds-canvas-image', `url("${resolved.value}")`);
  }

  root.classList.remove(WALLPAPER_CLASS, WALLPAPER_IMAGE_CLASS, WALLPAPER_COLOR_CLASS);
  if (resolved.kind === 'color') {
    root.classList.add(WALLPAPER_COLOR_CLASS);
  } else if (resolved.kind === 'image') {
    root.classList.add(WALLPAPER_CLASS, WALLPAPER_IMAGE_CLASS);
  }
}

/** Apply background and, for images, sample + persist a shell tint when missing. */
export async function applyBackgroundWithImageTint(bg: ProtoBg): Promise<void> {
  const resolved = resolveBackgroundForScheme(bg);
  applyBackground(bg);
  if (resolved?.kind !== 'image') return;

  const rawTint = bg.tint ?? (await sampleImageTint(bg.value));
  const canvasTint = tintForAppearance(rawTint);
  document.documentElement.style.setProperty('--pds-canvas-bg', canvasTint);

  if (bg.tint !== rawTint) {
    const updated = { kind: 'image' as const, value: bg.value, tint: rawTint };
    setActiveBackground(updated);
    writeSavedImage({ value: bg.value, tint: rawTint });
  }
}

function imageCanvasTint(bg: Extract<ProtoBg, { kind: 'image' }>): string {
  if (bg.tint) return tintForAppearance(bg.tint);
  return DEFAULT_CANVAS_BG;
}

/** Average color from a downscaled decode — used for shell glass, not the html wallpaper. */
export async function sampleImageTint(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined') return '#f7f6f3';
  try {
    const img = await loadImageForTint(dataUrl);
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
