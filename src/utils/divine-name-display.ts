/**
 * Respectful capitalization for divine names in human-facing labels (Admin Pulse themes,
 * OpenBible topic slugs, etc.). Does not alter matching keys — apply at display/API output only.
 */

import type { PulseThemeRankItem } from '@/utils/universal-bible-entities';

const GODS_POSSESSIVE_RE =
  /\bgods\s+(love|kingdom|grace|mercy|word|spirit|presence|power|will|plan|promise|people|children|son|sons|daughter|daughters)\b/giu;

const PREPOSITION_GOD_RE = /\b(in|of|with|to|for|from|and|or)\s+god\b/giu;

const STANDALONE_GOD_RE = /\bgod\b/giu;

/** Capitalize God (and God's) in a theme or tag label shown to users. */
export function formatDivineNamesInLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;

  let out = trimmed.replace(GODS_POSSESSIVE_RE, (_, tail: string) => `God's ${tail}`);
  out = out.replace(PREPOSITION_GOD_RE, (match, prep: string) => `${prep} God`);
  out = out.replace(STANDALONE_GOD_RE, 'God');
  return out;
}

/** Apply divine-name display formatting to ranked Pulse theme rows. */
export function formatPulseThemeLabels(items: PulseThemeRankItem[]): PulseThemeRankItem[] {
  return items.map((item) => ({
    ...item,
    name: formatDivineNamesInLabel(item.name),
  }));
}
