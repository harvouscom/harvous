/**
 * Space / ministry channel cover catalog (5 families × 5 variants × light/dark).
 * Separate from Settings › Appearance wallpapers — see docs/future/SPACE_COVER_IMAGE_VARIANTS.md.
 */
import catalogJson from '../../shared/space-cover-image-presets.json';
import type { SpaceCoverAppearance, SpaceCoverBg } from './space-cover';

export type SpaceCoverMode = 'light' | 'dark';
export type SpaceCoverFamily = 'blue' | 'purple' | 'orange' | 'green' | 'pink';

export type SpaceCoverPresetRow = {
  id: string;
  family: string;
  variant: number;
  label: string;
  file: string;
  mode: SpaceCoverMode;
  legacyAppearanceId?: string;
};

type SpaceCoverCatalog = {
  basePath: string;
  families: string[];
  presets: SpaceCoverPresetRow[];
};

const catalog = catalogJson as SpaceCoverCatalog;

const PRESETS = catalog.presets;
const FAMILIES = new Set(catalog.families);
const BY_ID = new Map(PRESETS.map((p) => [p.id, p]));
const LEGACY_TO_ID = new Map(
  PRESETS.filter((p) => p.legacyAppearanceId).map((p) => [p.legacyAppearanceId!, p.id]),
);

export const SPACE_COVER_PRESET_IDS = new Set(PRESETS.map((p) => p.id));

export function isSpaceCoverFamily(value: string | null | undefined): value is SpaceCoverFamily {
  return Boolean(value && FAMILIES.has(value));
}

export function spaceCoverPresetById(id: string | null | undefined): SpaceCoverPresetRow | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

/** Resolve a stored preset id (space-cover or legacy Appearance id) to a catalog row. */
export function resolveSpaceCoverPresetRow(presetId: string | null | undefined): SpaceCoverPresetRow | null {
  if (!presetId) return null;
  return BY_ID.get(presetId) ?? BY_ID.get(LEGACY_TO_ID.get(presetId) ?? '') ?? null;
}

export function spaceCoverPresetUrl(preset: SpaceCoverPresetRow): string {
  return `${catalog.basePath}/${preset.mode}/${preset.file}`;
}

export function resolveSpaceCoverImageUrl(presetId: string | null | undefined): string | null {
  const row = resolveSpaceCoverPresetRow(presetId);
  return row ? spaceCoverPresetUrl(row) : null;
}

export function listSpaceCoverVariantsForFamily(
  family: string,
  mode: SpaceCoverMode,
): SpaceCoverPresetRow[] {
  return PRESETS.filter((p) => p.family === family && p.mode === mode).sort(
    (a, b) => a.variant - b.variant,
  );
}

export function clampSpaceCoverVariant(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function spaceCoverFromFamilyVariant(
  family: string | null | undefined,
  variant: number = 1,
): SpaceCoverAppearance {
  if (!isSpaceCoverFamily(family)) {
    return { light: null, dark: null };
  }
  const v = clampSpaceCoverVariant(variant);
  const light = PRESETS.find((p) => p.family === family && p.variant === v && p.mode === 'light');
  const dark = PRESETS.find((p) => p.family === family && p.variant === v && p.mode === 'dark');
  return {
    light: light ? { kind: 'image-preset', presetId: light.id } : null,
    dark: dark ? { kind: 'image-preset', presetId: dark.id } : null,
  };
}

export function parseSpaceCoverFamilyAndVariant(
  bg: SpaceCoverBg | null | undefined | string,
): { family: SpaceCoverFamily; variant: number } | null {
  let resolved = bg;
  if (typeof resolved === 'string') {
    try {
      resolved = JSON.parse(resolved) as SpaceCoverBg;
    } catch {
      return null;
    }
  }
  if (!resolved || typeof resolved !== 'object' || resolved.kind !== 'image-preset') return null;
  const row = resolveSpaceCoverPresetRow(resolved.presetId);
  if (!row || !isSpaceCoverFamily(row.family)) return null;
  return { family: row.family, variant: row.variant };
}

/** Infer cover variant from stored light cover + current color family. */
export function resolveSpaceCoverVariant(
  storedLight: SpaceCoverBg | null | undefined,
  family: string | null | undefined,
): number {
  const parsed = parseSpaceCoverFamilyAndVariant(storedLight);
  if (parsed && parsed.family === family) return parsed.variant;
  return 1;
}
