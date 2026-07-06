import type { CSSProperties } from 'react';
import {
  colorPresetById,
  imagePresetById,
  imagePresetUrl,
  type ProtoBg,
} from './prototype-background';
import { appearanceAccentForThreadColor, coverBgForMode, effectiveSpaceCover, type SpaceCoverAppearance, type SpaceCoverBg } from '@/utils/space-cover';
import { getThreadGradientCSS } from '@/utils/colors';

export interface JoinCoverDisplay {
  bandStyle: CSSProperties;
  accentCss: string;
  isImage: boolean;
}

function coverBgToProto(bg: SpaceCoverBg): ProtoBg {
  if (!bg) return null;
  return bg;
}

function resolveCoverColorValue(bg: SpaceCoverBg, mode: 'light' | 'dark'): string | null {
  if (!bg || bg.kind !== 'color') return null;
  if (bg.presetId) {
    const preset = colorPresetById(bg.presetId);
    if (preset) {
      const resolved = mode === 'dark'
        ? (preset.dark !== undefined ? preset.dark : preset.light)
        : preset.light;
      if (resolved) return resolved;
    }
  }
  return bg.value;
}

export function resolveJoinCoverDisplay(
  space: {
    color?: string;
    backgroundGradient?: string;
    cover?: SpaceCoverAppearance;
  },
  mode: 'light' | 'dark',
): JoinCoverDisplay {
  const accentCss =
    appearanceAccentForThreadColor(space.color, mode) ?? `var(--color-${space.color || 'paper'})`;
  const fallbackGradient = space.backgroundGradient || getThreadGradientCSS(space.color || 'paper');
  const resolvedCover = effectiveSpaceCover(space.cover ?? { light: null, dark: null }, space.color);
  const cover = coverBgForMode(resolvedCover, mode);
  const proto = coverBgToProto(cover);

  if (proto?.kind === 'image-preset') {
    return {
      isImage: true,
      accentCss,
      bandStyle: {},
    };
  }

  if (proto?.kind === 'color') {
    const fill = resolveCoverColorValue(cover, mode) ?? accentCss;
    return {
      isImage: false,
      accentCss: fill.startsWith('#') || fill.startsWith('var(') ? fill : accentCss,
      bandStyle: { background: fill },
    };
  }

  return {
    isImage: false,
    accentCss,
    bandStyle: { background: fallbackGradient },
  };
}

export function resolveJoinHeroImageUrl(
  space: {
    color?: string;
    cover?: SpaceCoverAppearance;
  },
  mode: 'light' | 'dark',
): string | null {
  const resolvedCover = effectiveSpaceCover(space.cover ?? { light: null, dark: null }, space.color);
  const cover = coverBgForMode(resolvedCover, mode);
  if (cover?.kind !== 'image-preset') return null;
  const preset = imagePresetById(cover.presetId);
  return preset ? imagePresetUrl(preset) : null;
}

/** Full-bleed hero behind the join letter — space cover image or accent gradient. */
export function resolveJoinHeroBackground(
  space: {
    color?: string;
    backgroundGradient?: string;
    cover?: SpaceCoverAppearance;
  },
  mode: 'light' | 'dark',
): CSSProperties {
  const url = resolveJoinHeroImageUrl(space, mode);
  if (url) {
    return {
      backgroundImage: `url("${url}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  const { bandStyle } = resolveJoinCoverDisplay(space, mode);
  return bandStyle;
}
