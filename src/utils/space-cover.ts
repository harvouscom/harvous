/**
 * Shared space cover appearance — same shape as device appearance `ProtoBg`,
 * stored per mode on Spaces (`coverBgLight` / `coverBgDark` JSON columns).
 */
import appearanceImagePresets from '../../shared/appearance-image-presets.json';
import appearancePresets from '../../shared/appearance-presets.json';
import {
  clampSpaceCoverVariant,
  isSpaceCoverFamily,
  resolveSpaceCoverVariant,
  SPACE_COVER_PRESET_IDS,
  spaceCoverFromFamilyVariant,
} from './space-cover-presets';

export type SpaceCoverBg =
  | { kind: 'color'; value: string; presetId?: string }
  | { kind: 'image-preset'; presetId: string; tint?: string }
  | null;

export type SpaceCoverAppearance = {
  light: SpaceCoverBg;
  dark: SpaceCoverBg;
};

type AppearanceColorPreset = {
  id: string;
  light: string | null;
  dark?: string | null;
};

type AppearanceImagePresetRow = {
  id: string;
  mode: 'light' | 'dark';
};

const IMAGE_PRESET_IDS = new Set([
  ...(appearanceImagePresets.presets as AppearanceImagePresetRow[]).map((p) => p.id),
  ...SPACE_COVER_PRESET_IDS,
]);
const COLOR_PRESET_IDS = new Set(
  (appearancePresets.presets as AppearanceColorPreset[]).map((p) => p.id),
);

/** Non-paper color presets — same carousel order as Settings › Appearance › Colors. */
const APPEARANCE_COLOR_PRESETS = (appearancePresets.presets as AppearanceColorPreset[]).filter(
  (p) => p.id !== 'paper',
);

const APPEARANCE_LIGHT_IMAGE_PRESETS = (appearanceImagePresets.presets as AppearanceImagePresetRow[]).filter(
  (p) => p.mode === 'light',
);
const APPEARANCE_DARK_IMAGE_PRESETS = (appearanceImagePresets.presets as AppearanceImagePresetRow[]).filter(
  (p) => p.mode === 'dark',
);

export function emptySpaceCoverAppearance(): SpaceCoverAppearance {
  return { light: null, dark: null };
}

export function parseSpaceCoverBg(raw: string | null | undefined | SpaceCoverBg): SpaceCoverBg {
  if (raw == null || raw === '') return null;
  // Already-parsed API / cache objects (prefetch returns objects, not JSON strings).
  if (typeof raw === 'object') {
    return validateSpaceCoverBg(raw) ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return validateSpaceCoverBg(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeSpaceCoverBg(bg: SpaceCoverBg): string | null {
  if (!bg) return null;
  return JSON.stringify(bg);
}

export function validateSpaceCoverBg(value: unknown): value is NonNullable<SpaceCoverBg> {
  if (!value || typeof value !== 'object') return false;
  const bg = value as Record<string, unknown>;
  if (bg.kind === 'color') {
    return typeof bg.value === 'string' && bg.value.length > 0
      && (bg.presetId == null || (typeof bg.presetId === 'string' && COLOR_PRESET_IDS.has(bg.presetId)));
  }
  if (bg.kind === 'image-preset') {
    return typeof bg.presetId === 'string' && IMAGE_PRESET_IDS.has(bg.presetId)
      && (bg.tint == null || typeof bg.tint === 'string');
  }
  return false;
}

export function parseSpaceCoverAppearance(
  lightRaw: string | null | undefined,
  darkRaw: string | null | undefined,
): SpaceCoverAppearance {
  return {
    light: parseSpaceCoverBg(lightRaw ?? null),
    dark: parseSpaceCoverBg(darkRaw ?? null),
  };
}

/** Accept JSON object or string from API bodies / FormData. */
export function coerceSpaceCoverBgInput(raw: unknown): SpaceCoverBg {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') return parseSpaceCoverBg(raw);
  if (typeof raw === 'object' && validateSpaceCoverBg(raw)) return raw;
  return null;
}

export function coverBgForMode(
  appearance: SpaceCoverAppearance,
  mode: 'light' | 'dark',
): SpaceCoverBg {
  return mode === 'dark' ? (appearance.dark ?? appearance.light) : (appearance.light ?? appearance.dark);
}

/**
 * Thread accent colors offered in the space color picker, in Settings › Appearance order.
 * Cream (yellow) is intentionally excluded as a space option.
 */
export const SPACE_COVER_PICKER_COLORS = [
  'blue',
  'purple',
  'orange',
  'green',
  'pink',
] as const;

export type SpaceCoverPickerColor = (typeof SPACE_COVER_PICKER_COLORS)[number];

/** Appearance color preset ids — index-aligned with image preset arrays below. */
export const APPEARANCE_COLOR_PRESET_IDS = APPEARANCE_COLOR_PRESETS.map((p) => p.id);

/** Image preset ids — sourced from `shared/appearance-image-presets.json` order. */
export const SPACE_COVER_LIGHT_IMAGE_IDS = APPEARANCE_LIGHT_IMAGE_PRESETS.map((p) => p.id);
export const SPACE_COVER_DARK_IMAGE_IDS = APPEARANCE_DARK_IMAGE_PRESETS.map((p) => p.id);

/** Thread accent → appearance color preset id (Settings › Appearance). */
export const THREAD_TO_APPEARANCE_COLOR_ID: Record<SpaceCoverPickerColor, string> = {
  blue: 'sky',
  purple: 'lilac',
  orange: 'peach',
  green: 'mint',
  pink: 'pink',
};

/**
 * Appearance color → paired imagery preset id.
 * Dark presets are index-aligned with light presets in appearance-image-presets.json
 * (breeze↔cinder, drift↔caldera, meadow↔depths, dawn↔flare, halo↔twilight, aurora↔ember).
 */
export const APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID: Record<string, string> = {
  sky: 'breeze',
  lilac: 'aurora',
  peach: 'drift',
  mint: 'meadow',
  pink: 'dawn',
  cream: 'drift',
};

export const APPEARANCE_COLOR_TO_DARK_IMAGE_ID: Record<string, string> = {
  sky: 'cinder',
  lilac: 'ember',
  peach: 'caldera',
  mint: 'depths',
  pink: 'flare',
  cream: 'ember',
};

/** Reverse maps: appearance image preset id → its paired appearance color id (per mode). */
const LIGHT_IMAGE_TO_APPEARANCE_COLOR_ID: Record<string, string> = Object.fromEntries(
  Object.entries(APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID).map(([colorId, imageId]) => [imageId, colorId]),
);
const DARK_IMAGE_TO_APPEARANCE_COLOR_ID: Record<string, string> = Object.fromEntries(
  Object.entries(APPEARANCE_COLOR_TO_DARK_IMAGE_ID).map(([colorId, imageId]) => [imageId, colorId]),
);

/** Canvas hex for an appearance color preset id (`sky`, `mint`, …); null for paper/unknown. */
export function appearancePresetHex(
  appearanceId: string | null | undefined,
  mode: 'light' | 'dark',
): string | null {
  if (!appearanceId) return null;
  const preset = (appearancePresets.presets as AppearanceColorPreset[]).find((p) => p.id === appearanceId);
  if (!preset) return null;
  const hex = mode === 'dark' ? (preset.dark ?? preset.light) : preset.light;
  return hex ?? null;
}

/**
 * Resolve a user's appearance background (a `ProtoBg` / `SpaceCoverBg`) to a solid
 * accent hex for the given mode — the color they picked in Settings › Appearance.
 * Color presets carry the mode-correct hex directly; image presets map to their
 * paired color's canvas hex. Paper / unset returns null (caller falls back).
 */
export function appearanceAccentHexFromCoverBg(
  bg: SpaceCoverBg,
  mode: 'light' | 'dark',
): string | null {
  if (!bg) return null;
  if (bg.kind === 'color') {
    return bg.value?.startsWith('#') ? bg.value : null;
  }
  if (bg.kind === 'image-preset') {
    const imageToColor = mode === 'dark' ? DARK_IMAGE_TO_APPEARANCE_COLOR_ID : LIGHT_IMAGE_TO_APPEARANCE_COLOR_ID;
    return appearancePresetHex(imageToColor[bg.presetId], mode);
  }
  return null;
}

/** Legible glyph/initial color for a solid accent hex (dark mode → near-white). */
export function avatarGlyphColorForAccent(
  accentHex: string | null | undefined,
  mode: 'light' | 'dark',
): string | null {
  if (mode === 'dark') return 'rgba(255, 255, 255, 0.96)';
  if (accentHex?.startsWith('#')) {
    return `oklch(from ${accentHex} calc(l * 0.58) min(c * 3.5, 0.2) h)`;
  }
  return accentHex ? `color-mix(in oklch, ${accentHex} 55%, var(--site-ink))` : null;
}

export function appearanceColorIdForThreadColor(color: string | null | undefined): string | null {
  const key = (color ?? '').toLowerCase();
  if (!(SPACE_COVER_PICKER_COLORS as readonly string[]).includes(key)) return null;
  return THREAD_TO_APPEARANCE_COLOR_ID[key as SpaceCoverPickerColor] ?? null;
}

export function coverIndexForThreadColor(color: string | null | undefined): number {
  const appearanceId = appearanceColorIdForThreadColor(color);
  if (!appearanceId) return -1;
  return APPEARANCE_COLOR_PRESET_IDS.indexOf(appearanceId);
}

/** Paired appearance canvas hex for a thread accent (Settings › Appearance colors). */
export function appearanceAccentForThreadColor(
  color: string | null | undefined,
  mode: 'light' | 'dark',
): string | null {
  const appearanceId = appearanceColorIdForThreadColor(color);
  if (!appearanceId) return null;
  const preset = APPEARANCE_COLOR_PRESETS.find((p) => p.id === appearanceId);
  if (!preset) return null;
  if (mode === 'dark') {
    return preset.dark !== undefined ? preset.dark : preset.light;
  }
  return preset.light;
}

/**
 * Every hue the legacy `--color-*` set actually defines.
 *
 * The column these values come from (`UserMetadata.userColor`, `Spaces.color`) is free text with
 * no enum, so a value can arrive that no token backs — a retired hue, a fixture, a typo. CSS
 * treats `var(--color-teal)` with nothing behind it as invalid and drops the whole declaration,
 * so the element loses its background entirely rather than falling back to something. That is
 * silent, and it is how activity-feed avatars ended up as empty rings.
 */
const DEFINED_COLOR_TOKENS = [
  'blue', 'gray', 'green', 'highlighter', 'navy', 'orange',
  'paper', 'pink', 'purple', 'red', 'white', 'yellow',
] as const;

export type DefinedColorToken = (typeof DEFINED_COLOR_TOKENS)[number];

const DEFINED_COLOR_TOKEN_SET: ReadonlySet<string> = new Set(DEFINED_COLOR_TOKENS);

/**
 * A `--color-*` reference that always resolves to something visible.
 *
 * `fallback` answers both of the questions a call site has — what to show when there is no
 * colour at all, and what to show when the colour names a token nothing defines. One parameter
 * rather than two on purpose: a surface that wants purple for "this thread has no colour" wants
 * purple for "this thread's colour is one I cannot resolve" too. Splitting them would invite
 * call sites to answer the same question two different ways by accident, which is close to how
 * this class of bug arises in the first place.
 *
 * Typed to the defined set, so a fallback that is itself undefined cannot be passed — a guard
 * that falls back to nothing is worse than no guard, because it looks like protection.
 */
export function colorTokenVar(
  color: string | null | undefined,
  fallback: DefinedColorToken,
): string {
  const key = color?.trim().toLowerCase();
  if (!key) return `var(--color-${fallback})`;
  if (DEFINED_COLOR_TOKEN_SET.has(key)) return `var(--color-${key})`;
  return `var(--color-${key}, var(--color-${fallback}))`;
}

/**
 * A legacy thread-token reference that always resolves to something visible.
 *
 * Paper for a missing colour, because that is the neutral a space without one has always shown;
 * blue for an unrecognised one, because that is what every server path already substitutes
 * (`userColor ?? 'blue'`), so an unknown hue degrades to the same thing an absent one does.
 */
export function threadColorVar(color: string | null | undefined): string {
  return colorTokenVar(color || 'paper', 'blue');
}

/** Color-picker dot fill — appearance hex when paired, else legacy thread token. */
export function spacePickerSwatchColor(
  color: string,
  mode: 'light' | 'dark' = 'light',
): string {
  return appearanceAccentForThreadColor(color, mode) ?? threadColorVar(color);
}

/** Icon glyph on a space-color tile — saturated mid-tone from the tile hue (not near-black dark preset). */
export function appearanceIconGlyphColor(
  color: string | null | undefined,
  mode: 'light' | 'dark',
): string {
  if (mode === 'dark') {
    return 'rgba(255, 255, 255, 0.96)';
  }
  const accent = appearanceAccentForThreadColor(color, 'light');
  if (accent?.startsWith('#')) {
    return `oklch(from ${accent} calc(l * 0.58) min(c * 3.5, 0.2) h)`;
  }
  if (accent) {
    return `color-mix(in oklch, ${accent} 55%, var(--site-ink))`;
  }
  return threadColorVar(color);
}

/**
 * Thread hues that have a dark ramp in the design-system tokens. The legacy
 * `--color-*` set is light-only, so it can't be the dark-mode fallback.
 */
const DARK_AWARE_THREAD_TOKENS = new Set(['blue', 'yellow', 'green', 'pink', 'orange', 'purple']);

/** Join letter + menu row — appearance accent hex for the tile background. */
export function spaceIconAccentHex(
  color: string | null | undefined,
  mode: 'light' | 'dark',
): string {
  const preset = appearanceAccentForThreadColor(color, mode);
  if (preset) return preset;
  const key = (color || 'paper').toLowerCase();
  // Yellow is excluded from the space picker (see SPACE_COVER_PICKER_COLORS), so it
  // has no paired appearance preset and lands here — as do any pre-existing spaces
  // on a retired hue. `--color-*` never darkens, which made a yellow tile glare as a
  // near-white block in dark mode. `--pds-thread-*` carries the proper dark ramp;
  // keep the legacy token as the fallback for surfaces that don't load pds tokens.
  if (DARK_AWARE_THREAD_TOKENS.has(key)) {
    return `var(--pds-thread-${key}, var(--color-${key}))`;
  }
  return threadColorVar(key);
}

/** @deprecated Prefer `spaceIconAccentHex` + `.space-icon-tile` CSS for glyph color. */
export function spaceIconTileStyles(
  color: string | null | undefined,
  mode: 'light' | 'dark',
): { background: string; color: string } {
  const accent = spaceIconAccentHex(color, mode);
  return {
    background: accent,
    color: appearanceIconGlyphColor(color, mode),
  };
}

function imagePresetCover(id: string): SpaceCoverBg {
  if (!IMAGE_PRESET_IDS.has(id)) return null;
  return { kind: 'image-preset', presetId: id };
}

/**
 * Derive light/dark space-cover images from family color + variant (default 1).
 * paper → no imagery. Variants 2–5 live in `shared/space-cover-image-presets.json`.
 */
export function spaceCoverFromThreadColor(
  color: string | null | undefined,
  variant: number = 1,
): SpaceCoverAppearance {
  const key = (color ?? 'paper').toLowerCase();
  if (key === 'paper' || !isSpaceCoverFamily(key)) return emptySpaceCoverAppearance();
  return spaceCoverFromFamilyVariant(key, clampSpaceCoverVariant(variant));
}

/**
 * Prefer stored space-cover variant when it matches the current color family;
 * otherwise fall back to family + variant 1.
 */
export function effectiveSpaceCover(
  stored: SpaceCoverAppearance,
  threadColor: string | null | undefined,
  variant?: number,
): SpaceCoverAppearance {
  const key = (threadColor ?? 'paper').toLowerCase();
  if (key === 'paper' || !isSpaceCoverFamily(key)) return emptySpaceCoverAppearance();
  const resolvedVariant =
    variant != null
      ? clampSpaceCoverVariant(variant)
      : resolveSpaceCoverVariant(stored.light, key);
  return spaceCoverFromFamilyVariant(key, resolvedVariant);
}

export function serializeSpaceCoverForDb(cover: SpaceCoverAppearance): {
  coverBgLight: string | null;
  coverBgDark: string | null;
} {
  return {
    coverBgLight: serializeSpaceCoverBg(cover.light),
    coverBgDark: serializeSpaceCoverBg(cover.dark),
  };
}

/** API payloads — color family + stored variant (default 1). */
export function spaceCoverApiFields(
  storedLight: string | null | undefined,
  storedDark: string | null | undefined,
  threadColor: string | null | undefined,
): { coverBgLight: SpaceCoverBg; coverBgDark: SpaceCoverBg } {
  const cover = effectiveSpaceCover(
    parseSpaceCoverAppearance(storedLight, storedDark),
    threadColor,
  );
  return { coverBgLight: cover.light, coverBgDark: cover.dark };
}
