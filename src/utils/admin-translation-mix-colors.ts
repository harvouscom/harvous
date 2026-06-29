/** Normalize a count to 0–1 intensity (same model as canon book heatmap). */
export function translationMixHeatLevel(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return count / max;
}

/** Spread mid/low counts so tail translations stay visible in the bar. */
export function translationMixScaledHeat(count: number, max: number): number {
  const linear = translationMixHeatLevel(count, max);
  return Math.sqrt(linear);
}

/**
 * Distinct purple-family hues (violet → indigo → magenta → plum).
 * Ordinal index keeps segments distinguishable when counts are similar.
 */
const TRANSLATION_MIX_HUES = [
  278, 262, 292, 248, 308, 270, 286, 255, 300, 268, 315, 242, 280, 258, 295, 275,
] as const;

const TRANSLATION_MIX_SATURATIONS = [58, 52, 54, 48, 56, 50, 53, 46, 55, 49, 57, 47, 51, 45, 54, 48] as const;

export type TranslationMixColors = {
  segment: string;
  swatch: string;
};

export function translationMixColors(index: number, count: number, max: number): TranslationMixColors {
  const heat = translationMixScaledHeat(count, max);
  const hue = TRANSLATION_MIX_HUES[index % TRANSLATION_MIX_HUES.length]!;
  const sat = TRANSLATION_MIX_SATURATIONS[index % TRANSLATION_MIX_SATURATIONS.length]!;
  const light = 30 + heat * 32;
  const segment = `hsl(${hue} ${sat}% ${light}%)`;
  const swatch = `hsl(${hue} ${Math.min(sat + 4, 68)}% ${Math.max(light - 4, 26)}%)`;
  return { segment, swatch };
}
